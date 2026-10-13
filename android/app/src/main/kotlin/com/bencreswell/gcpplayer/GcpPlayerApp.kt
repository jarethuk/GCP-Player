package com.bencreswell.gcpplayer

import android.app.Application
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.playback.AudioDownloadService
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@UnstableApi
@HiltAndroidApp
class GcpPlayerApp : Application() {

    /**
     * Built eagerly rather than on first use: creating it is what reconnects
     * the downloader to work the system carried on while the app was gone,
     * and what re-applies the Wi-Fi-only requirement for this process.
     */
    @Inject lateinit var downloads: DownloadsRepository

    override fun onCreate() {
        super.onCreate()
        // The download service can be started by a manual download before
        // anything has played, so its notification channel is created here.
        AudioDownloadService.createChannel(this)
    }
}
