package com.objectpad.app.data

import android.content.Context
import android.util.Log
import io.ktor.http.HttpMethod
import io.privy.auth.AuthState
import io.privy.auth.PrivyUser
import io.privy.auth.oAuth.OAuthProvider
import io.privy.logging.PrivyLogLevel
import io.privy.sdk.Privy
import io.privy.sdk.PrivyConfig
import io.privy.wallet.ethereum.EthereumRpcRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.math.BigInteger

/** Build-time identity of the ObjectPad Privy app, shared with objectpad.fun so accounts and wallets are the same everywhere. */
object AuthConfig {
    const val PRIVY_APP_ID = "cmu9ynto900gm0cl37y8987od"
    /** Android app client from the Privy dashboard (Settings → Clients). Set EXPO_PUBLIC_PRIVY_APP_CLIENT_ID to enable native sign-in. */
    val PRIVY_APP_CLIENT_ID: String get() = (com.objectpad.app.Config.allValues["EXPO_PUBLIC_PRIVY_APP_CLIENT_ID"] ?: "").trim()
    const val URL_SCHEME = "objectpad"
}

/** Anything that can sign and broadcast a Robinhood Chain transaction. */
interface WalletSigner {
    val address: String
    val label: String
    /** Signs and broadcasts; returns the transaction hash. */
    suspend fun send(tx: TxRequest): String
}

/** Wallet generated on this phone. The key is sealed by the Android Keystore and never leaves the device. */
class LocalWallet(private val privateKey: BigInteger) : WalletSigner {
    override val address: String = Crypto.address(privateKey)
    override val label: String = "ObjectPad wallet · on this phone"
    val privateKeyHex: String get() = "0x" + privateKey.toString(16).padStart(64, '0')
    override suspend fun send(tx: TxRequest): String {
        val prepared = ChainClient.prepare(address, tx)
        return ChainClient.sendRaw(TxSigner.signLegacy(prepared, privateKey, Chain.ID))
    }
}

/** The account's Privy embedded wallet: the same address the creator has on objectpad.fun. Signed by Privy, broadcast here. */
class PrivyWallet(private val user: PrivyUser) : WalletSigner {
    private val wallet get() = user.embeddedEthereumWallets.firstOrNull() ?: throw IllegalStateException("Your account has no wallet yet.")
    override val address: String get() = wallet.address
    override val label: String = "Account wallet · same as objectpad.fun"
    override suspend fun send(tx: TxRequest): String {
        val prepared = ChainClient.prepare(address, tx)
        val payload = buildJsonObject {
            put("from", address); put("to", prepared.to); put("data", prepared.data); put("value", Hex.of(prepared.value))
            put("gas", Hex.of(prepared.gas)); put("gasPrice", Hex.of(prepared.gasPrice)); put("nonce", Hex.of(prepared.nonce)); put("chainId", Chain.ID)
        }
        val signed = wallet.provider.request(EthereumRpcRequest.ethSignTransaction(payload.toString())).getOrElse {
            throw IllegalStateException(it.message ?: "The account wallet declined to sign.")
        }.data
        return ChainClient.sendRaw(signed)
    }
}

data class AccountState(
    val ready: Boolean = false,
    val signInAvailable: Boolean = false,
    val signedIn: Boolean = false,
    val userId: String? = null,
    val accountWallet: String? = null,
    val localWallet: String? = null,
    val profile: Profile? = null,
    val busy: Boolean = false,
    val error: String? = null,
) {
    /** The wallet trades are signed with: the account wallet when signed in, otherwise this phone's wallet. */
    val activeWallet: String? get() = accountWallet ?: localWallet
}

/**
 * One identity for the whole app, identical to the website: a signed-in Privy account when there is one,
 * otherwise an account-free guest token (only its hash is stored on the server). Launching never needs an account.
 */
class AccountManager(context: Context, private val secure: SecureStore, private val scope: CoroutineScope) {
    private val _state = MutableStateFlow(AccountState())
    val state: StateFlow<AccountState> = _state.asStateFlow()
    private val guestLock = Mutex()
    private var privy: Privy? = null

    init {
        val clientId = AuthConfig.PRIVY_APP_CLIENT_ID
        if (clientId.isNotEmpty()) {
            privy = runCatching { Privy.init(context.applicationContext, PrivyConfig(appId = AuthConfig.PRIVY_APP_ID, appClientId = clientId, logLevel = PrivyLogLevel.NONE)) }
                .onFailure { Log.w("ObjectPad", "Privy init failed: ${it.javaClass.simpleName}") }.getOrNull()
        }
        _state.update { it.copy(signInAvailable = privy != null, localWallet = loadLocal()?.address) }
        val p = privy
        if (p == null) _state.update { it.copy(ready = true) } else scope.launch {
            runCatching { p.awaitReady() }
            p.authState.collect { auth -> onAuth(auth) }
        }
    }

    private suspend fun onAuth(auth: AuthState) {
        when (auth) {
            is AuthState.Authenticated -> {
                val user = auth.user
                if (user.embeddedEthereumWallets.isEmpty()) runCatching { user.createEthereumWallet(false) }
                _state.update { it.copy(ready = true, signedIn = true, userId = user.id, accountWallet = user.embeddedEthereumWallets.firstOrNull()?.address) }
                refreshProfile()
            }
            AuthState.Unauthenticated -> _state.update { it.copy(ready = true, signedIn = false, userId = null, accountWallet = null, profile = null) }
            else -> Unit
        }
    }

    /** The signed-in account's Privy access token, if any. */
    suspend fun accountToken(): String? {
        val user = privy?.user ?: return null
        return user.getAccessToken().getOrNull()
    }

    fun guestToken(): String? = secure.get("guest")?.takeIf { Regex("^g_[a-f0-9]{64}$").matches(it) }

    /** Returns the guest token, asking the API for one on first use. */
    suspend fun ensureGuestToken(): String = guestLock.withLock {
        guestToken() ?: ObjectPadApi.send<GuestToken>("/guests").token.also { secure.put("guest", it) }
    }

    /** Current creator identity: the account when signed in, otherwise the guest token. */
    suspend fun token(): String = accountToken() ?: ensureGuestToken()

    fun deviceSecret(sessionId: String): String? = secure.get("device.$sessionId")?.takeIf { Regex("^[a-f0-9]{64}$").matches(it) }
    fun saveDeviceSecret(sessionId: String, secret: String) = secure.put("device.$sessionId", secret)
    fun forgetDeviceSecret(sessionId: String) = secure.put("device.$sessionId", null)

    /**
     * Access attempts for one capture session, in the website's order: this phone's device secret, the current
     * identity, then (for signed-in users) the older guest token.
     */
    suspend fun sessionHeaders(sessionId: String): List<Map<String, String>> = buildList {
        deviceSecret(sessionId)?.let { add(mapOf("X-Capture-Device" to it)) }
        add(mapOf("Authorization" to "Bearer ${token()}"))
        if (state.value.signedIn) guestToken()?.let { add(mapOf("Authorization" to "Bearer $it")) }
    }

    // Sign-in
    suspend fun sendEmailCode(email: String): Result<Unit> = privy?.email?.sendCode(email) ?: Result.failure(IllegalStateException("Sign-in isn’t switched on in this build yet."))
    suspend fun loginWithEmail(code: String, email: String): Result<Unit> {
        val p = privy ?: return Result.failure(IllegalStateException("Sign-in isn’t switched on in this build yet."))
        return p.email.loginWithCode(code, email).map { afterLogin(); Unit }
    }
    suspend fun loginWithX(): Result<Unit> {
        val p = privy ?: return Result.failure(IllegalStateException("Sign-in isn’t switched on in this build yet."))
        return p.oAuth.login(OAuthProvider.Twitter, "${AuthConfig.URL_SCHEME}://").map { afterLogin(); Unit }
    }

    private suspend fun afterLogin() {
        val user = privy?.user ?: return
        if (user.embeddedEthereumWallets.isEmpty()) runCatching { user.createEthereumWallet(false) }
        _state.update { it.copy(signedIn = true, userId = user.id, accountWallet = user.embeddedEthereumWallets.firstOrNull()?.address) }
        refreshProfile()
    }

    suspend fun logout() { privy?.logout(); _state.update { it.copy(signedIn = false, userId = null, accountWallet = null, profile = null) } }

    /** POST /account creates the public profile on first use and returns the account's creator wallet. */
    suspend fun refreshProfile() {
        val token = accountToken() ?: return
        runCatching { ObjectPadApi.send<Profile>("/account", token = token) }.onSuccess { p -> _state.update { it.copy(profile = p, accountWallet = it.accountWallet ?: p.wallet) } }
    }

    suspend fun setAlias(alias: String): Result<Profile> = runCatching {
        ObjectPadApi.send<Profile>("/profile", body = buildJsonObject { put("alias", alias) }, token = token())
    }.onSuccess { p -> _state.update { it.copy(profile = it.profile?.copy(alias = p.alias) ?: p) } }

    /** Moves an unlaunched guest scan into the signed-in account's inventory. */
    suspend fun adopt(sessionId: String): Int {
        val token = accountToken() ?: return 0
        val body = buildJsonObject { put("sessionId", sessionId); guestToken()?.let { put("guestToken", it) }; deviceSecret(sessionId)?.let { put("deviceSecret", it) } }
        return runCatching { ObjectPadApi.send<Adopted>("/account/adopt", body = body, token = token).adopted }.getOrDefault(0)
    }

    // Wallets
    private fun loadLocal(): LocalWallet? = secure.get("wallet.key")?.takeIf { Crypto.isValidPrivateKey(it) }?.let { LocalWallet(BigInteger(it.removePrefix("0x"), 16)) }
    fun localWallet(): LocalWallet? = loadLocal()

    /** Creates (once) this phone's wallet. Generated with a secure random key; the server only ever sees the address. */
    fun ensureLocalWallet(): LocalWallet {
        loadLocal()?.let { return it }
        val key = Crypto.newPrivateKey()
        secure.put("wallet.key", "0x" + key.toString(16).padStart(64, '0'))
        return LocalWallet(key).also { w -> _state.update { it.copy(localWallet = w.address) } }
    }

    fun importLocalWallet(hex: String): Result<String> {
        if (!Crypto.isValidPrivateKey(hex)) return Result.failure(IllegalArgumentException("That isn’t a valid 64-character private key."))
        secure.put("wallet.key", "0x" + hex.trim().removePrefix("0x").lowercase())
        val w = loadLocal() ?: return Result.failure(IllegalStateException("The key could not be saved."))
        _state.update { it.copy(localWallet = w.address) }
        return Result.success(w.address)
    }

    fun removeLocalWallet() { secure.put("wallet.key", null); _state.update { it.copy(localWallet = null) } }

    /** Signer for trades and claims. Guests get this phone's wallet, created on first use. */
    fun signer(): WalletSigner {
        val user = privy?.user
        if (user != null && user.embeddedEthereumWallets.isNotEmpty()) return PrivyWallet(user)
        return ensureLocalWallet()
    }

    /** Helper used by screens that need an authenticated write for the current identity. */
    suspend inline fun <reified T> write(path: String, body: kotlinx.serialization.json.JsonElement? = null, method: HttpMethod = HttpMethod.Post): T =
        ObjectPadApi.send(path, method, body, token())
}
