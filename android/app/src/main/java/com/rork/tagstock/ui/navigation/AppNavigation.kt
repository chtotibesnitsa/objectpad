package com.rork.tagstock.ui.navigation

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.rork.tagstock.R
import com.rork.tagstock.data.Chain
import com.rork.tagstock.ui.AppViewModel
import com.rork.tagstock.ui.screens.ActivityScreen
import com.rork.tagstock.ui.screens.BattlesScreen
import com.rork.tagstock.ui.screens.CasesScreen
import com.rork.tagstock.ui.screens.ExploreScreen
import com.rork.tagstock.ui.screens.InfoPage
import com.rork.tagstock.ui.screens.InfoScreen
import com.rork.tagstock.ui.screens.LaunchScreen
import com.rork.tagstock.ui.screens.LeaderboardScreen
import com.rork.tagstock.ui.screens.MoreScreen
import com.rork.tagstock.ui.screens.QuestsScreen
import com.rork.tagstock.ui.screens.StatusScreen
import com.rork.tagstock.ui.screens.TokenDetailScreen
import com.rork.tagstock.ui.screens.TokenViewModel
import com.rork.tagstock.ui.screens.TransactionsScreen
import com.rork.tagstock.ui.screens.WalletScreen
import com.rork.tagstock.ui.screens.WebHandoffScreen
import com.rork.tagstock.ui.screens.Wordmark
import com.rork.tagstock.ui.theme.CasepadColors

/** Route table mirroring the website's paths so deep links map 1:1. */
sealed class Dest(val route: String) {
    data object Explore : Dest("explore"); data object Cases : Dest("crates"); data object Battles : Dest("battles"); data object Quests : Dest("quests")
    data object Leaderboard : Dest("leaderboard"); data object Launch : Dest("launch"); data object Portfolio : Dest("portfolio"); data object Market : Dest("market")
    data object Keys : Dest("keys"); data object Rewards : Dest("rewards"); data object Studio : Dest("studio"); data object HowItWorks : Dest("how-it-works")
    data object Fairness : Dest("fairness"); data object Help : Dest("help"); data object Settings : Dest("settings"); data object Setup : Dest("setup")
    data object Playbook : Dest("playbook"); data object Practice : Dest("practice"); data object Status : Dest("status"); data object Transactions : Dest("transactions")
    data object Activity : Dest("activity"); data object More : Dest("more")
    data class Token(val address: String) : Dest("token/$address")

    companion object {
        /** Parses a casepad.fun URL into a destination. */
        fun fromUri(uri: android.net.Uri?): Dest? {
            val parts = uri?.pathSegments ?: return null
            return when (parts.firstOrNull()) {
                "token" -> parts.getOrNull(1)?.takeIf { Chain.isAddress(it) }?.let { Token(it.lowercase()) }
                "crates", "cases" -> Cases; "battles" -> Battles; "quests" -> Quests; "leaderboard" -> Leaderboard; "launch" -> Launch
                "portfolio" -> Portfolio; "market" -> Market; "keys" -> Keys; "rewards" -> Rewards; "studio" -> Studio; "how-it-works" -> HowItWorks
                "fairness" -> Fairness; "help" -> Help; "settings" -> Settings; "setup" -> Setup; "playbook" -> Playbook; "practice" -> Practice
                "status" -> Status; "transactions" -> Transactions; else -> null
            }
        }
    }
}

private data class Tab(val dest: Dest, val label: String, val icon: ImageVector)
private val TABS = listOf(
    Tab(Dest.Explore, "Explore", Icons.Filled.Explore), Tab(Dest.Cases, "Cases", Icons.Filled.GridView), Tab(Dest.Battles, "Battles", Icons.Filled.Bolt),
    Tab(Dest.Portfolio, "Portfolio", Icons.Filled.AccountBalanceWallet), Tab(Dest.More, "More", Icons.Filled.Menu),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppNavigation(intent: Intent?, modifier: Modifier = Modifier) {
    val nav: NavHostController = rememberNavController()
    val vm: AppViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route ?: Dest.Explore.route
    val isTab = TABS.any { it.dest.route == route }
    val lifecycle = LocalLifecycleOwner.current

    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_START) vm.start() else if (e == Lifecycle.Event.ON_STOP) vm.stop() }
        lifecycle.lifecycle.addObserver(obs)
        onDispose { lifecycle.lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(intent?.data) { Dest.fromUri(intent?.data)?.let { nav.navigate(it.route) } }

    val goToken: (String) -> Unit = { nav.navigate("token/$it") }
    val go: (Dest) -> Unit = { nav.navigate(it.route) }

    Scaffold(
        modifier = modifier.fillMaxSize(), containerColor = CasepadColors.Background,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Wordmark(18) },
                navigationIcon = { if (!isTab) IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                actions = {
                    Row(Modifier.padding(end = 12.dp).clip(CircleShape).background(CasepadColors.Card).clickable { go(Dest.Status) }.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(if (state.status != null) CasepadColors.Up else CasepadColors.Down))
                        Text(state.status?.chain?.name ?: Chain.NAME, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = CasepadColors.Muted)
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = CasepadColors.Background),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = CasepadColors.Background.copy(alpha = 0.96f)) {
                TABS.forEach { tab ->
                    NavigationBarItem(
                        selected = route == tab.dest.route || (tab.dest == Dest.Explore && route.startsWith("token/")),
                        onClick = { nav.navigate(tab.dest.route) { popUpTo(Dest.Explore.route) { saveState = true }; launchSingleTop = true; restoreState = true } },
                        icon = { Icon(tab.icon, contentDescription = tab.label) }, label = { Text(tab.label, fontSize = 10.sp, fontWeight = FontWeight.SemiBold) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = CasepadColors.Gold, selectedTextColor = CasepadColors.Gold, unselectedIconColor = CasepadColors.Muted, unselectedTextColor = CasepadColors.Muted, indicatorColor = Color.Transparent),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            NavHost(nav, startDestination = Dest.Explore.route) {
                composable(Dest.Explore.route) { ExploreScreen(state, { vm.refresh() }, goToken, { go(Dest.Launch) }, vm::toast) }
                composable(Dest.Cases.route) { CasesScreen(state, goToken) }
                composable(Dest.Battles.route) { BattlesScreen(goToken) }
                composable(Dest.Quests.route) { QuestsScreen(goToken) }
                composable(Dest.Leaderboard.route) { LeaderboardScreen() }
                composable(Dest.Launch.route) { LaunchScreen(state) }
                composable(Dest.Portfolio.route) { WalletScreen(state, vm::setWallet, goToken, vm::toast) }
                composable(Dest.More.route) { MoreScreen(state, go, vm::toast) }
                composable(Dest.Status.route) { StatusScreen(state) }
                composable(Dest.Transactions.route) { TransactionsScreen() }
                composable(Dest.Activity.route) { ActivityScreen() }
                composable(Dest.HowItWorks.route) { InfoScreen(InfoPage.HOW, state) }
                composable(Dest.Fairness.route) { InfoScreen(InfoPage.FAIRNESS, state) }
                composable(Dest.Help.route) { InfoScreen(InfoPage.HELP, state) }
                composable(Dest.Playbook.route) { InfoScreen(InfoPage.PLAYBOOK, state) }
                composable(Dest.Market.route) { WebHandoffScreen("Market & Vault", "/market", "Your on-site Casepad vault, swap offers and the ten closest listings from other holders.", R.drawable.nav_market) }
                composable(Dest.Keys.route) { WebHandoffScreen("Keys", "/keys", "Usable keys, their rounds and expiry, plus key transfers.", R.drawable.nav_keys) }
                composable(Dest.Rewards.route) { WebHandoffScreen("Reward History", "/rewards", "Every reveal you opened with its RNG proof, claim state and payout receipt.", R.drawable.nav_history) }
                composable(Dest.Studio.route) { WebHandoffScreen("Creator Studio", "/studio", "Your launched coins, treasury claims, case publishing and quest review queue.", R.drawable.nav_studio) }
                composable(Dest.Settings.route) { WebHandoffScreen("Settings", "/settings", "Username, privacy, notifications, motion, age confirmation and region.", R.drawable.nav_settings) }
                composable(Dest.Setup.route) { WebHandoffScreen("Platform setup", "/setup", "Operator integration status and readiness. Visible to authorized accounts only.", R.drawable.nav_setup) }
                composable(Dest.Practice.route) { WebHandoffScreen("Practice arcade", "/practice", "Free spins with practice credits only. Never mixed with funded cases.", R.drawable.nav_cases) }
                composable("token/{address}") { entry ->
                    val address = entry.arguments?.getString("address") ?: return@composable
                    val tvm: TokenViewModel = viewModel(key = address) { TokenViewModel(address) }
                    DisposableEffect(address) { tvm.start(); onDispose { tvm.stop() } }
                    TokenDetailScreen(tvm, state, vm::toast, { go(Dest.Portfolio) })
                }
            }
            AnimatedVisibility(state.toast != null, Modifier.align(Alignment.TopCenter).padding(top = 8.dp)) {
                Text(state.toast ?: "", fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(CasepadColors.CardRaised).padding(horizontal = 14.dp, vertical = 10.dp))
            }
        }
    }
}

@Suppress("unused") private val unusedSpacer = @Composable { Spacer(Modifier.height(0.dp)); Column {} ; Modifier.fillMaxWidth() }
