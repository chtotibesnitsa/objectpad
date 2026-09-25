package com.rork.tagstock.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.rork.tagstock.R
import com.rork.tagstock.data.BurnFeed
import com.rork.tagstock.data.CasepadApi
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.ChainClient
import com.rork.tagstock.data.Format
import com.rork.tagstock.data.PlatformConfig
import com.rork.tagstock.ui.AppUiState
import com.rork.tagstock.ui.navigation.Dest
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono

private data class MoreItem(val dest: Dest, val label: String, val art: Int)

@Composable
fun MoreScreen(app: AppUiState, onNav: (Dest) -> Unit, onToast: (String) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val terminal = listOf(MoreItem(Dest.Quests, "Quests", R.drawable.nav_quests), MoreItem(Dest.Leaderboard, "Leaderboard", R.drawable.nav_leaderboard), MoreItem(Dest.Launch, "Launch coin", R.drawable.nav_launch))
    val account = listOf(MoreItem(Dest.Market, "Market & Vault", R.drawable.nav_market), MoreItem(Dest.Keys, "Keys", R.drawable.nav_keys), MoreItem(Dest.Rewards, "Reward History", R.drawable.nav_history), MoreItem(Dest.Studio, "Creator Studio", R.drawable.nav_studio))
    val utility = listOf(
        MoreItem(Dest.HowItWorks, "How It Works", R.drawable.nav_book), MoreItem(Dest.Fairness, "Fairness & Proof", R.drawable.nav_shield), MoreItem(Dest.Help, "Help", R.drawable.nav_help),
        MoreItem(Dest.Settings, "Settings", R.drawable.nav_settings), MoreItem(Dest.Setup, "Platform setup", R.drawable.nav_setup), MoreItem(Dest.Playbook, "Launch playbook", R.drawable.nav_book),
        MoreItem(Dest.Practice, "Practice arcade", R.drawable.nav_cases), MoreItem(Dest.Status, "System status", R.drawable.nav_shield), MoreItem(Dest.Transactions, "Transactions", R.drawable.nav_history), MoreItem(Dest.Activity, "Activity", R.drawable.nav_history),
    )
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Wordmark(); Spacer(Modifier.weight(1f))
                app.xUrl?.let { x -> Text("𝕏 @CasePadFun", fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(CasepadColors.Secondary).clickable { ctx.openUrl(x) }.padding(horizontal = 12.dp, vertical = 10.dp)) }
            }
        }
        item { CopyChip("Official CA", app.casepadCA, onToast) }
        listOf("Terminal" to terminal, "Account" to account, "More" to utility).forEach { (title, items) ->
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eyebrow(title)
                    Column(Modifier.clip(CardShape).background(CasepadColors.Card)) {
                        items.forEachIndexed { i, it ->
                            Row(Modifier.fillMaxWidth().clickable { onNav(it.dest) }.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                AsyncImage(model = it.art, contentDescription = null, modifier = Modifier.size(30.dp))
                                Text(it.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = CasepadColors.Muted)
                            }
                            if (i < items.lastIndex) Row(Modifier.padding(start = 54.dp)) { Divider() }
                        }
                    }
                }
            }
        }
        item { Text("PONS V2 / CHAIN ${Chain.ID}\nYour wallet. Your trades.", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
    }
}

@Composable
fun StatusScreen(app: AppUiState, modifier: Modifier = Modifier) {
    var platform by remember { mutableStateOf<PlatformConfig?>(null) }
    var burns by remember { mutableStateOf<BurnFeed?>(null) }
    var rpcChain by remember { mutableStateOf<Int?>(null) }
    var rpcBlock by remember { mutableStateOf<Int?>(null) }
    var rpcError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        platform = runCatching { CasepadApi.platform() }.getOrNull()
        burns = runCatching { CasepadApi.burns() }.getOrNull()
        runCatching { rpcChain = ChainClient.chainId(); rpcBlock = ChainClient.blockNumber(); rpcError = null }.onFailure { rpcError = it.message }
    }
    @Composable fun Check(label: String, ok: Boolean, detail: String) {
        Row(Modifier.padding(vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.padding(top = 5.dp)) { StatusDot(ok) }
            Column { Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold); Text(detail, fontSize = 11.sp, color = CasepadColors.Muted) }
        }
    }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("System status", "live checks · nothing is hardcoded green") }
        item {
            Card(raised = true) {
                val s = app.status
                Check("Casepad backend", s != null, s?.let { "${it.name} · ${if (it.paused) "paused" else "running"}${if (it.maintenance) " · maintenance" else ""}" } ?: (app.error ?: "unreachable"))
                Check("Robinhood Chain RPC", rpcChain == Chain.ID, rpcError ?: rpcBlock?.let { "chain $rpcChain · block $it" } ?: "probing…")
                Check("Live cases", app.openCases?.live == true, if (app.openCases?.live == true) "operator switch on" else "switched off by operator")
                Check("Real value payouts", s?.realValue == "enabled", s?.realValue ?: "—")
                Check("Fee routing", s != null && s.feeRouting != "unavailable", s?.feeRouting ?: "—")
                Check("CASEPAD buyback", platform?.buyback?.status == "enabled", platform?.let { "${it.buyback.status} · ${it.buyback.reason}" } ?: "—")
            }
        }
        platform?.let { p ->
            item {
                Card {
                    Eyebrow("readiness checks")
                    p.readiness.checks.forEach { Check(it.id.replace('-', ' '), it.ok, it.detail) }
                    if (p.blockers.isNotEmpty()) { Eyebrow("blockers", CasepadColors.Down); p.blockers.forEach { Text("· $it", fontSize = 11.sp, color = CasepadColors.Muted) } }
                }
            }
        }
        burns?.let { b ->
            item {
                Card {
                    Eyebrow("CASEPAD buyback & burn"); Spacer(Modifier.height(6.dp))
                    Row { StatCell("Burned total", Format.eth(b.totalBurnedWei, 5), Modifier.weight(1f)); StatCell("Interval", "${b.intervalMs / 60_000} min", Modifier.weight(1f), end = true) }
                    Text("Target ${Format.shortAddress(b.target ?: Chain.CASEPAD_TOKEN)} → ${Format.shortAddress(Chain.BURN_ADDRESS)}", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
        app.status?.let { s -> item { Card { Eyebrow("randomness"); Text(s.randomness.method, fontSize = 12.sp, fontWeight = FontWeight.SemiBold); Text(s.randomness.note, fontSize = 11.sp, color = CasepadColors.Muted) } } }
    }
}

enum class InfoPage { HOW, FAIRNESS, HELP, PLAYBOOK }

@Composable
fun InfoScreen(page: InfoPage, app: AppUiState, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val c = app.status?.contribution
    val dev = (c?.devBps ?: 50) / 100.0; val crates = (c?.cratesBps ?: 50) / 100.0; val burn = (c?.buybackBps ?: 50) / 100.0
    val mins = (app.terminal?.platform?.fees?.buybackIntervalMs ?: 1_800_000L) / 60_000
    @Composable fun Block(title: String, body: String) { Card { Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold); Text(body, fontSize = 13.sp, color = CasepadColors.Muted, modifier = Modifier.padding(top = 4.dp)) } }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        when (page) {
            InfoPage.HOW -> {
                item { SectionHead("How It Works", "a coin. a treasury. its own cases.") }
                item { Block("Launch and trade", "Launch a coin on Pons V2 with a fixed 1B supply and an ETH bonding curve. It graduates into a Uniswap v4 pool at 4.2 ETH. Trades happen in your own wallet.") }
                item { Block("Where fees go", "Every curve trade carries a 1%% Pons fee plus %.1f%% Casepad: %.1f%% to the creator, %.1f%% to that coin's case treasury, %.1f%% buys and burns CASEPAD every %d minutes.".format(dev + crates + burn, dev, crates, burn, mins)) }
                item { Block("Burn coins for a chance at more", "Burn the coin to mint a key, then open one of its cases. Every outcome is paid in the same coin from the treasury. Odds are fixed and published before the round and never a guaranteed return.") }
                item { Block("After you win", "Rewards are claimable to your wallet or into your Casepad vault, where you can swap them with other holders on the Market.") }
                item { Block("Platform presets vs creator designs", "Casepad ships tuned case tables (0.1x to 100x). Creators can also design their own tables; both are published with return and profit odds.") }
            }
            InfoPage.FAIRNESS -> {
                item { SectionHead("Fairness & Proof", "proof, not promises.") }
                item { Block("How a live draw works", app.status?.randomness?.note ?: "Each round commits a server seed hash before any key is sold. Your client seed plus a future block hash are mixed in at reveal; the server seed is published when the round closes.") }
                item { Block("What you can check yourself", "Every reveal page shows the seed commit, your client seed, the block hash and the draw hash. GET /draws lists every settled draw publicly so anyone can recompute the result.") }
                item { Block("On-chain vs off-chain", "Burns, payouts, dev payouts and buybacks are on Robinhood Chain with receipts. Draw selection is off-chain but committed and verifiable.") }
                item { Block("Inventory and solvency", "A case can only be published when the treasury holds every prize. Held, committed and claimable units are shown on each coin page and must satisfy the invariant.") }
                item { SecondaryButton("Open the public draw record", { ctx.openUrl("${CasepadApi.SITE}/fairness") }, Modifier.fillMaxWidth()) }
            }
            InfoPage.HELP -> {
                item { SectionHead("Help", "get unstuck.") }
                item { Block("Why can I not launch?", "Launches need a wallet on Robinhood Chain (id 4663) with enough ETH for the factory launch fee and gas. Bridge via the Arbitrum portal or Relay.") }
                item { Block("Why is the burn button disabled?", "Either live cases are switched off by the operator, the round has no keys left, you have not confirmed age/region in Settings, or your wallet is on the wrong network.") }
                item { Block("My payout says failed", "Failed payouts are retried automatically and shown on the Transactions page. Nothing is lost; the reward stays claimable.") }
                item { Block("Can I win a real car or watch?", "No. Case art is themed; every prize is an amount of the coin you burned.") }
                item { Block("Contact", "Reach the team on X @CasePadFun.") }
                app.xUrl?.let { x -> item { SecondaryButton("Message on X", { ctx.openUrl(x) }, Modifier.fillMaxWidth()) } }
            }
            InfoPage.PLAYBOOK -> {
                item { SectionHead("Launch playbook", "from launch to first funded case") }
                item { Block("1. Launch", "Pick a name, ticker and image. Sign launchAndBuy in MetaMask. Your coin appears on Explore once the launch is indexed.") }
                item { Block("2. Let fees accrue", "Each trade routes %.1f%% of notional to your coin's treasury. Auto-claim sweeps escrow into the treasury as it accrues.".format(crates)) }
                item { Block("3. Publish a case", "In Creator Studio, choose a platform preset or design your own table. A round publishes only when the treasury covers every prize.") }
                item { Block("4. Grow", "Post quests that pay keys, host battles, and watch reveals land on the live tape.") }
            }
        }
    }
}
