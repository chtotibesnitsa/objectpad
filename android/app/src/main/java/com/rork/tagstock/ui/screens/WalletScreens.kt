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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rork.tagstock.data.CasepadApi
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.Format
import com.rork.tagstock.ui.AppUiState
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono
import java.net.URLEncoder

@Composable
private fun Field(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    Row(modifier.clip(RoundedCornerShape(10.dp)).background(CasepadColors.Secondary).padding(horizontal = 12.dp).height(44.dp), verticalAlignment = Alignment.CenterVertically) {
        BasicTextField(value, onChange, singleLine = true, textStyle = TextStyle(color = CasepadColors.Foreground, fontSize = 13.sp, fontFamily = Mono), cursorBrush = SolidColor(CasepadColors.Gold), modifier = Modifier.weight(1f),
            decorationBox = { inner -> if (value.isEmpty()) Text(placeholder, fontSize = 13.sp, color = CasepadColors.Muted); inner() })
    }
}

@Composable
fun WalletScreen(app: AppUiState, onWallet: (String?) -> Unit, onToken: (String) -> Unit, onToast: (String) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var input by remember { mutableStateOf("") }
    var invalid by remember { mutableStateOf(false) }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { SectionHead("Portfolio", "Robinhood Chain · id ${Chain.ID}") }
        val wallet = app.watchedWallet
        if (wallet == null) item {
            Card(raised = true) {
                Text("Watch a wallet", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text("Paste your MetaMask address to see its live ETH, CASEPAD and launched-coin balances from Robinhood Chain. Read-only; the app never asks for a seed phrase or private key.", fontSize = 12.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field(input, { input = it }, "0x…", Modifier.weight(1f))
                    Icon(Icons.Default.ContentPaste, contentDescription = "Paste", tint = CasepadColors.Foreground, modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(CasepadColors.Secondary).clickable { clipboard.getText()?.text?.let { input = it } }.padding(12.dp))
                    PrimaryButton("Watch", { val v = input.trim(); if (Chain.isAddress(v)) { onWallet(v.lowercase()); invalid = false } else invalid = true })
                }
                if (invalid) Text("That is not a valid 0x address.", fontSize = 11.sp, color = CasepadColors.Down, modifier = Modifier.padding(top = 6.dp))
            }
        } else item {
            Card(raised = true) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) { Eyebrow("watching"); Text(Format.shortAddress(wallet), fontFamily = Mono, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy address", tint = CasepadColors.Foreground, modifier = Modifier.size(32.dp).clickable { ctx.copyText("Address", wallet); onToast("Address copied") }.padding(6.dp))
                    Icon(Icons.Default.OpenInNew, contentDescription = "Open on Blockscout", tint = CasepadColors.Foreground, modifier = Modifier.size(32.dp).clickable { ctx.openUrl(Chain.addressUrl(wallet)) }.padding(6.dp))
                    Icon(Icons.Default.Close, contentDescription = "Stop watching", tint = CasepadColors.Muted, modifier = Modifier.size(32.dp).clickable { onWallet(null) }.padding(6.dp))
                }
                Spacer(Modifier.height(8.dp)); Divider(); Spacer(Modifier.height(4.dp))
                BalanceRow("ETH", "Robinhood Chain ETH", app.ethBalance, app.ethUsd)
                BalanceRow("CASEPAD", "Official CasePad token", app.casepadBalance, null)
                if (app.coinBalances.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp)); Eyebrow("launched coins held")
                    app.coins.filter { app.coinBalances.containsKey(it.token) }.forEach { coin ->
                        val bal = app.coinBalances[coin.token] ?: 0.0
                        Row(Modifier.fillMaxWidth().clickable { onToken(coin.token) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            CoinImage(coin.image, coin.ticker, 30); Text("$${coin.ticker}", fontSize = 13.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.weight(1f))
                            Column(horizontalAlignment = Alignment.End) { Text(Format.tokens(bal), fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.SemiBold); coin.market?.priceUsd?.let { Text(Format.usd(it * bal), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) } }
                        }
                    }
                } else if (app.balancesAt != null) Text("No Casepad-launched coins held by this wallet.", fontSize = 11.sp, color = CasepadColors.Muted, modifier = Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(6.dp))
                Eyebrow(app.balancesAt?.let { "balances read ${Format.timeAgo(it)} · rpc.mainnet.chain.robinhood.com" } ?: "reading chain…")
            }
        }
        item {
            Card {
                Eyebrow("signing & account")
                Text("Trades, launches, burns, claims and X linking are signed with MetaMask on casepad.fun. Your account, keys, rewards and vault are the same there and here.", fontSize = 12.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 8.dp))
                PrimaryButton("Open casepad.fun in MetaMask", { ctx.openUrl("https://metamask.app.link/dapp/casepad.fun/portfolio") }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                SecondaryButton("Open in browser", { ctx.openUrl("${CasepadApi.SITE}/portfolio") }, Modifier.fillMaxWidth())
                Text("Native in-app signing (WalletConnect) and the X-linked account session are the next slice; nothing here pretends a transaction happened.", fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun BalanceRow(symbol: String, label: String, amount: Double?, usd: Double?) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column { Text(symbol, fontSize = 13.sp, fontWeight = FontWeight.Bold); Text(label, fontSize = 10.sp, color = CasepadColors.Muted) }
        Spacer(Modifier.weight(1f))
        if (amount == null) CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = CasepadColors.Muted)
        else Column(horizontalAlignment = Alignment.End) {
            Text(Format.tokens(amount), fontFamily = Mono, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            if (usd != null && usd > 0) Text(Format.usd(amount * usd), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted)
        }
    }
}

@Composable
fun LaunchScreen(app: AppUiState, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    var name by remember { mutableStateOf("") }; var ticker by remember { mutableStateOf("") }; var description by remember { mutableStateOf("") }
    var website by remember { mutableStateOf("") }; var twitter by remember { mutableStateOf("") }
    val valid = name.isNotBlank() && ticker.length in 2..10
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { SectionHead("Launch a coin", "Pons V2 · 1B supply · graduates at 4.2 ETH") }
        item {
            Card(raised = true) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Eyebrow("Name"); Field(name, { name = it }, "e.g. Third Coin")
                    Eyebrow("Ticker"); Field(ticker, { ticker = it.uppercase().take(10) }, "THIRD")
                    Eyebrow("Description"); Field(description, { description = it }, "What is this coin about?")
                    Eyebrow("Website (optional)"); Field(website, { website = it }, "https://")
                    Eyebrow("X (optional)"); Field(twitter, { twitter = it }, "https://x.com/…")
                }
            }
        }
        item {
            Card {
                Eyebrow("what you get"); Spacer(Modifier.height(6.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Bullet("Its own isolated treasury address, funded by trade fees.")
                    Bullet("Cases funded in this coin; holders burn it for keys.")
                    Bullet("%.1f%% creator payout on every trade, paid automatically to the launching wallet.".format((app.status?.contribution?.devBps ?: 50) / 100.0))
                    Bullet("1% Pons curve fee. Launch fee is read live from the factory at signing time.")
                }
            }
        }
        item {
            PrimaryButton("Continue in MetaMask to sign", {
                val q = listOf("name" to name, "ticker" to ticker, "description" to description, "website" to website, "twitter" to twitter)
                    .filter { it.second.isNotBlank() }.joinToString("&") { "${it.first}=${URLEncoder.encode(it.second, "UTF-8")}" }
                ctx.openUrl("https://metamask.app.link/dapp/casepad.fun/launch?$q")
            }, Modifier.fillMaxWidth(), enabled = valid)
            Text("Your details are carried into the website's launch form where the image upload, live launch-fee quote and launchAndBuy signature happen. A coin is only shown as launched once the chain and indexer confirm it.", fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

/** Account-gated web features: honest handoff to the authenticated website session. */
@Composable
fun WebHandoffScreen(title: String, path: String, body: String, art: Int, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead(title) }
        item {
            Card(raised = true, padding = 20) {
                coil3.compose.AsyncImage(model = art, contentDescription = null, modifier = Modifier.size(96.dp).align(Alignment.CenterHorizontally))
                Text(body, fontSize = 13.sp, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp))
                PrimaryButton("Open in MetaMask", { ctx.openUrl("https://metamask.app.link/dapp/casepad.fun$path") }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                SecondaryButton("Open in browser", { ctx.openUrl("${CasepadApi.SITE}$path") }, Modifier.fillMaxWidth())
            }
        }
        item { Text("This screen needs your signed-in Casepad account (X or MetaMask via Privy). The native session is the next slice; until then the same account, keys and balances are shown on casepad.fun.", fontSize = 10.sp, color = CasepadColors.Muted) }
    }
}
