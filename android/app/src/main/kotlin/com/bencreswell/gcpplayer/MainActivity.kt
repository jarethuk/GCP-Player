package com.bencreswell.gcpplayer

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.bencreswell.gcpplayer.ui.GcpApp
import com.bencreswell.gcpplayer.ui.theme.GcpTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Hands the system splash over to the app's first frame. Must come
        // before super.onCreate().
        installSplashScreen()
        // Content runs under the status and navigation bars, so a show's
        // hero artwork can sit behind them the way it does on iOS.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            GcpTheme {
                RequestNotificationPermission()
                GcpApp()
            }
        }
    }
}

/**
 * The media notification is the lock-screen and Bluetooth control surface,
 * and from API 33 it needs permission. Asked for once, on first launch;
 * refusing it costs the controls, not playback.
 */
@Composable
private fun RequestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }
    LaunchedEffect(Unit) {
        // Only when it isn't already granted — otherwise every launch
        // fires a request the system silently swallows.
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
