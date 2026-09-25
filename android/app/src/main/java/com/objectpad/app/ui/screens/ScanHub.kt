package com.objectpad.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.Glass
import com.objectpad.app.ui.components.GlassIcon
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.ScreenPadding
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.press

/** Scan & launch entry: no account and no choices. One tap opens this phone's private scan. */
@Composable
fun ScanHub(app: AppUiState, onScan: () -> Unit, onQr: () -> Unit, onResume: (String) -> Unit) {
    val t = app.treasury
    val last = ObjectPadApp.instance.prefs.lastScan
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Raised(radius = 36.dp, padding = 22.dp) {
                GlassIcon(Glass.Qr, 96.dp, float = true)
                Lab("Scan & launch · no account", Modifier.padding(top = 14.dp))
                Display("Walk around it. We do the rest.", 40, Modifier.padding(top = 8.dp))
                Body("Your phone shoots six angles by itself. AI names it, a real 3D model is built, and the treasury launches its coin.", Modifier.padding(top = 10.dp), size = 16, weight = 700)
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip("$0 to you"); Chip("Treasury ${t.balanceEth?.let { "%.3f ETH".format(it) } ?: "…"}"); Chip(if (t.open) "${t.launchesLeft} free today" else "Queues free")
                }
                PadButton("Open the scanner", onScan, Modifier.fillMaxWidth().padding(top = 18.dp), glass = Glass.Qr, height = 66.dp)
                PadButton("Scan a QR from my computer", onQr, Modifier.fillMaxWidth().padding(top = 10.dp), style = BtnStyle.Glass, icon = Icons.Default.QrCodeScanner)
                Body("By scanning you confirm you may photograph this object.", Modifier.padding(top = 12.dp), size = 11)
            }
        }
        if (last != null) item {
            Raised(Modifier.fillMaxWidth().press { onResume(last) }, radius = 24.dp, padding = 14.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Mesh, 44.dp); Column(Modifier.padding(start = 10.dp)) { Strong("Resume your last scan"); Body("Photos, 3D progress and coin details are saved.", size = 12) } }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(Glass.Mesh to "One object on a plain table, even daylight.", Glass.Shield to "The object stays still. You move around it.", Glass.Ai to "AI checks it’s one of one before anything launches.", Glass.Rocket to "Your coin goes live on Robinhood Chain.").forEach { (g, s) ->
                    Raised(radius = 20.dp, padding = 10.dp) { Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(g, 40.dp); Body(s, Modifier.padding(start = 10.dp), size = 14, weight = 700) } }
                }
            }
        }
    }
}
