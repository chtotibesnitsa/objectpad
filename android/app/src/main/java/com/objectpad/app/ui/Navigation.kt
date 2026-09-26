package com.objectpad.app.ui

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.Scans
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.scan.QrScanScreen
import com.objectpad.app.ui.scan.ScanScreen
import com.objectpad.app.ui.screens.BurnScreen
import com.objectpad.app.ui.screens.CoinScreen
import com.objectpad.app.ui.screens.CoinsScreen
import com.objectpad.app.ui.screens.CommunityScreen
import com.objectpad.app.ui.screens.CraftScreen
import com.objectpad.app.ui.screens.HomeScreen
import com.objectpad.app.ui.screens.InfoScreen
import com.objectpad.app.ui.screens.MeScreen
import com.objectpad.app.ui.screens.RewardCreateScreen
import com.objectpad.app.ui.screens.RewardDetailScreen
import com.objectpad.app.ui.screens.RewardsScreen
import com.objectpad.app.ui.screens.SignInScreen
import com.objectpad.app.ui.screens.TreasuryScreen
import com.objectpad.app.ui.studio.StudioScreen
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.delay

private data class Tab(val route: String, val label: String, val icon: ImageVector)
private val TABS = listOf(Tab("home", "Home", Icons.Default.Home), Tab("coins", "Coins", Icons.Default.GridView), Tab("scan", "Scan", Icons.Default.ViewInAr), Tab("rewards", "Rewards", Icons.Default.EmojiEvents), Tab("me", "Me", Icons.Default.AccountCircle))

/** Routes a deep link (objectpad.fun URL) to its native screen. */
fun routeFor(uri: Uri?): String? {
    uri ?: return null
    val path = uri.path.orEmpty()
    return when {
        path.startsWith("/capture/claim") -> Scans.parseHandoff(uri.toString())?.let { (id, token) -> "capture?session=$id&token=${token.orEmpty()}" }
        path.startsWith("/launch/") -> path.removePrefix("/launch/").takeIf { Regex("^[a-f0-9-]{36}$").matches(it) }?.let { "studio/$it" }
        path.startsWith("/objects/") -> "coin/${path.removePrefix("/objects/")}"
        path.startsWith("/coin/") -> "coin/${path.removePrefix("/coin/")}"
        path == "/rewards" -> "rewards"
        path.startsWith("/rewards/") -> "reward/${path.removePrefix("/rewards/")}"
        path == "/v2" || path == "/changelog" -> "v2"
        else -> null
    }
}

@Composable
fun AppNavigation(link: Uri?) {
    val nav = rememberNavController()
    val vm: AppViewModel = viewModel()
    val app by vm.state.collectAsStateWithLifecycle()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val prefs = ObjectPadApp.instance.prefs

    LaunchedEffect(link) { routeFor(link)?.let { nav.navigate(it) } }

    fun startScan() { nav.navigate("capture?session=&token=") }
    fun openStudio(id: String) = nav.navigate("studio/$id") { launchSingleTop = true }
    fun openCoin(id: String) = nav.navigate("coin/$id")
    fun open(r: String) = nav.navigate(r)

    Box(Modifier.fillMaxSize().background(Pad.page)) {
        NavHost(nav, "home", Modifier.fillMaxSize(),
            enterTransition = { fadeIn() + slideInHorizontally { it / 10 } }, exitTransition = { fadeOut() },
            popEnterTransition = { fadeIn() }, popExitTransition = { fadeOut() + slideOutHorizontally { it / 10 } }) {
            composable("home") { Box(Modifier.statusBarsPadding()) { HomeScreen(app, ::startScan, { open("qr") }, ::openCoin, { nav.tab("coins") }, { nav.tab("burn") }, { open("treasury") }, { open("info/docs") }, prefs.lastScan, ::openStudio) { open("v2") } } }
            composable("coins") { Box(Modifier.statusBarsPadding()) { CoinsScreen(app, ::openCoin) { vm.refreshAll() } } }
            composable("scan") { Box(Modifier.statusBarsPadding()) { ScanHub(app, ::startScan, { open("qr") }, ::openStudio) } }
            composable("burn") { Box(Modifier.statusBarsPadding()) { BurnScreen(app) } }
            composable("rewards") { Box(Modifier.statusBarsPadding()) { RewardsScreen({ id -> open("reward/$id") }, { open("reward-new") }) } }
            composable("reward/{id}", listOf(navArgument("id") { type = NavType.StringType })) { e -> RewardDetailScreen(e.arguments?.getString("id").orEmpty(), { nav.popBackStack() }) { open("signin") } }
            composable("reward-new") { RewardCreateScreen({ nav.popBackStack() }, { open("signin") }) { id -> nav.navigate("reward/$id") { popUpTo("reward-new") { inclusive = true } } } }
            composable("me") { Box(Modifier.statusBarsPadding()) { MeScreen(app, ::openCoin, ::openStudio, { open("signin") }, { r -> open(if (r in setOf("treasury", "community", "craft")) r else "info/$r") }) { vm.refreshHoldings() } } }
            composable("coin/{id}", listOf(navArgument("id") { type = NavType.StringType })) { e ->
                CoinScreen(e.arguments?.getString("id").orEmpty(), app, { nav.popBackStack() }, vm::toggleWatch, vm::refreshHoldings) { open("signin") }
            }
            composable("studio/{id}", listOf(navArgument("id") { type = NavType.StringType })) { e ->
                StudioScreen(e.arguments?.getString("id").orEmpty(), app, { nav.popBackStack() }, { id -> nav.navigate("capture?session=$id&token=") }, ::open, ::openCoin)
            }
            composable("capture?session={session}&token={token}", listOf(navArgument("session") { defaultValue = "" }, navArgument("token") { defaultValue = "" })) { e ->
                val session = e.arguments?.getString("session").orEmpty().ifBlank { null }
                val token = e.arguments?.getString("token").orEmpty().ifBlank { null }
                ScanScreen(session, token, { nav.popBackStack() }) { id -> nav.navigate("studio/$id") { popUpTo("capture?session={session}&token={token}") { inclusive = true } } }
            }
            composable("qr") { QrScanScreen({ nav.popBackStack() }) { id, token -> nav.navigate("capture?session=$id&token=${token.orEmpty()}") { popUpTo("qr") { inclusive = true } } } }
            composable("treasury") { TreasuryScreen(app) { nav.popBackStack() } }
            composable("v2") { Box(Modifier.statusBarsPadding()) { com.objectpad.app.ui.screens.V2Screen(app, { nav.popBackStack() }) { startScan() } } }
            composable("signin") { SignInScreen({ nav.popBackStack() }) { nav.popBackStack(); vm.refreshHoldings() } }
            composable("community") { CommunityScreen { nav.popBackStack() } }
            composable("craft") { CraftScreen { nav.popBackStack() } }
            composable("info/{kind}") { e -> InfoScreen(e.arguments?.getString("kind").orEmpty(), app, { nav.popBackStack() }, ::openCoin) }
        }
        AnimatedVisibility(route in TABS.map { it.route } || route == "burn", Modifier.align(Alignment.BottomCenter), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
            TabBar(route) { r -> if (r == "scan" && route == "scan") startScan() else nav.tab(r) }
        }
        app.toast?.let { msg ->
            LaunchedEffect(msg) { delay(1800); vm.clearToast() }
            Box(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 12.dp).clip(RoundedCornerShape(50)).background(Pad.Ink).padding(horizontal = 18.dp, vertical = 11.dp)) { Text(msg, style = Type.strong.copy(color = Pad.White, fontSize = 13.sp)) }
        }
    }
}

private fun NavHostController.tab(route: String) = navigate(route) { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true }

@Composable
private fun TabBar(current: String?, onSelect: (String) -> Unit) {
    Row(
        Modifier.navigationBarsPadding().padding(horizontal = 14.dp, vertical = 10.dp).fillMaxWidth()
            .shadow(24.dp, RoundedCornerShape(32.dp), ambientColor = Pad.Ink.copy(alpha = 0.3f), spotColor = Pad.Ink.copy(alpha = 0.3f))
            .clip(RoundedCornerShape(32.dp)).background(Pad.raised).border(1.dp, Pad.Ink.copy(alpha = 0.08f), RoundedCornerShape(32.dp)).padding(6.dp),
        horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically,
    ) {
        TABS.forEach { t ->
            val selected = current == t.route
            val s by animateFloatAsState(if (selected) 1.06f else 1f, spring(dampingRatio = 0.5f), label = "tab")
            if (t.route == "scan") {
                Box(Modifier.size(60.dp).scale(s).clip(CircleShape).background(SolidColor(Pad.Ink)).press { onSelect(t.route) }, contentAlignment = Alignment.Center) { Icon(t.icon, t.label, tint = Pad.White, modifier = Modifier.size(26.dp)) }
            } else Column(Modifier.weight(1f).height(56.dp).scale(s).clip(RoundedCornerShape(22.dp)).background(if (selected) Pad.Ink.copy(alpha = 0.07f) else Pad.White.copy(alpha = 0f)).press { onSelect(t.route) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(t.icon, t.label, tint = if (selected) Pad.Ink else Pad.Muted, modifier = Modifier.size(22.dp))
                Text(t.label, style = Type.lab.copy(fontSize = 9.5.sp, color = if (selected) Pad.Ink else Pad.Muted))
            }
        }
    }
}
