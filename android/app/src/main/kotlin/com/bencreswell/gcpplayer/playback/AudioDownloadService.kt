package com.bencreswell.gcpplayer.playback

import android.app.Notification
import androidx.media3.common.util.NotificationUtil
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.PlatformScheduler
import androidx.media3.exoplayer.scheduler.Scheduler
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import com.bencreswell.gcpplayer.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * The foreground service Media3 runs downloads in. It exists so the system
 * keeps the work alive while the app is backgrounded or killed — the same
 * job iOS gives a background `URLSession`.
 *
 * Almost all of it is Media3's; this subclass only says which manager to
 * use and what the notification looks like.
 */
@UnstableApi
@AndroidEntryPoint
class AudioDownloadService : DownloadService(
    FOREGROUND_NOTIFICATION_ID,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    CHANNEL_ID,
    R.string.notifications_downloads_channel,
    0,
) {
    @Inject lateinit var downloads: DownloadsRepository

    private val notificationHelper: DownloadNotificationHelper by lazy {
        DownloadNotificationHelper(this, CHANNEL_ID)
    }

    override fun getDownloadManager(): DownloadManager = downloads.downloadManager

    /**
     * Lets the system restart downloads that were waiting on Wi-Fi once the
     * requirement is met, without the app being open.
     */
    override fun getScheduler(): Scheduler = PlatformScheduler(this, JOB_ID)

    override fun getForegroundNotification(
        downloads: MutableList<Download>,
        notMetRequirements: Int,
    ): Notification = notificationHelper.buildProgressNotification(
        this,
        android.R.drawable.stat_sys_download,
        null,
        null,
        downloads,
        notMetRequirements,
    )

    companion object {
        const val CHANNEL_ID = "downloads"
        private const val FOREGROUND_NOTIFICATION_ID = 2
        private const val JOB_ID = 1

        fun createChannel(context: android.content.Context) {
            NotificationUtil.createNotificationChannel(
                context,
                CHANNEL_ID,
                R.string.notifications_downloads_channel,
                0,
                NotificationUtil.IMPORTANCE_LOW,
            )
        }
    }
}
