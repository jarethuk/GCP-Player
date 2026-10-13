package com.bencreswell.gcpplayer.playback

import android.content.Context
import android.util.Log
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Requirements
import com.bencreswell.gcpplayer.data.settings.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Duration.Companion.days

/** What the UI needs to know about one episode's download. */
data class DownloadStatus(val state: Int, val percent: Float) {
    val isComplete: Boolean get() = state == Download.STATE_COMPLETED
    val isInFlight: Boolean
        get() = state == Download.STATE_DOWNLOADING ||
            state == Download.STATE_QUEUED ||
            state == Download.STATE_RESTARTING
}

/**
 * Episode audio kept on device, on top of Media3's downloader.
 *
 * Three things the iOS app had to hand-roll are free here:
 *
 *  1. [DownloadManager] survives process death, resumes, retries and
 *     reports progress by itself.
 *  2. "Download over Wi-Fi only" is a [Requirements] on the manager, so the
 *     *system* holds downloads back rather than a flag on each request.
 *  3. A [CacheDataSource] over the same cache means the player prefers
 *     downloaded bytes automatically — there is no `localURL ?: streamURL`
 *     switch to get out of step, which is the iOS version's one fragile
 *     seam.
 *
 * The one thing Media3's index cannot express is *why* a download exists,
 * so the manual flag rides in the request's `data` blob. The sweep drops
 * played episodes' downloads, which would quietly undo a deliberate request
 * to keep something you've already heard.
 */
/**
 * What the sync engine needs of the downloader: a way to free the file behind
 * an episode that is being deleted. Named separately so that logic can be
 * exercised without standing up a Media3 download cache.
 */
fun interface DownloadEraser {
    fun remove(guid: String)
}

@UnstableApi
@Singleton
class DownloadsRepository @Inject constructor(
    private val context: Context,
    private val settings: SettingsStore,
    okHttp: OkHttpClient,
) : DownloadEraser {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val databaseProvider = StandaloneDatabaseProvider(context)

    /**
     * One cache for downloads *and* streaming reads. [NoOpCacheEvictor]
     * because nothing here is evicted by size: the sweep below is what
     * decides when audio goes, and it does so on "heard it" and "a week
     * old", not on a byte budget.
     */
    val cache: SimpleCache = SimpleCache(
        File(context.filesDir, "episode-audio"),
        NoOpCacheEvictor(),
        databaseProvider,
    )

    private val httpDataSourceFactory = OkHttpDataSource.Factory(okHttp)

    /** Reads cached bytes when they're there and the network when they're not. */
    val cacheDataSourceFactory: DataSource.Factory = CacheDataSource.Factory()
        .setCache(cache)
        .setUpstreamDataSourceFactory(httpDataSourceFactory)
        .setCacheWriteDataSinkFactory(null) // streaming shouldn't fill the cache behind the downloader's back
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    private val ioExecutor: Executor = Executors.newFixedThreadPool(2)

    val downloadManager: DownloadManager = DownloadManager(
        context,
        databaseProvider,
        cache,
        httpDataSourceFactory,
        ioExecutor,
    ).apply {
        maxParallelDownloads = 2
    }

    private val _statuses = MutableStateFlow<Map<String, DownloadStatus>>(emptyMap())

    /** Download state by episode guid, for the indicators. */
    val statuses: StateFlow<Map<String, DownloadStatus>> = _statuses.asStateFlow()

    init {
        downloadManager.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(
                manager: DownloadManager,
                download: Download,
                finalException: Exception?,
            ) = refresh()

            override fun onDownloadRemoved(manager: DownloadManager, download: Download) = refresh()
        })
        refresh()
        // "Download over Wi-Fi only" is a requirement on the manager rather
        // than a flag on each request, so the *system* holds downloads back
        // — but `requirements` lives in memory, so it is re-applied on every
        // process start and whenever the setting changes.
        scope.launch { settings.settings.collect { setWifiOnly(it.wifiOnly) } }
        // Progress within a download doesn't fire a listener callback, so
        // poll while anything is running. Twice a second, like the iOS
        // player's own polling, and only while there is something to watch.
        scope.launch {
            while (true) {
                kotlinx.coroutines.delay(500)
                if (downloadManager.currentDownloads.isNotEmpty()) refresh()
            }
        }
    }

    /** Whether "download over Wi-Fi only" is enforced by the system. */
    fun setWifiOnly(wifiOnly: Boolean) {
        downloadManager.requirements = if (wifiOnly) {
            Requirements(Requirements.NETWORK_UNMETERED)
        } else {
            Requirements(Requirements.NETWORK)
        }
    }

    /**
     * Starts a download unless the episode is already held or already
     * running. Automatic downloads also skip anything already heard; a
     * request made by hand doesn't — wanting a second listen is a perfectly
     * good reason to keep a file.
     */
    fun download(guid: String, source: AudioSource, manual: Boolean) {
        if (!shouldDownload(guid)) return

        val request = DownloadRequest.Builder(guid, source.url.toUri())
            .setData(if (manual) MANUAL_FLAG else AUTOMATIC_FLAG)
            // The player reads through the same cache under the same key, so a
            // Patreon episode downloaded from one signed URL plays from disk
            // when the next play is handed another.
            .setCustomCacheKey(source.cacheKey)
            .build()
        DownloadService.sendAddDownload(context, AudioDownloadService::class.java, request, false)
        Log.i(TAG, "queued ${if (manual) "manual" else "automatic"} download $guid")
    }

    /** Not already held and not already on its way. */
    fun shouldDownload(guid: String): Boolean {
        val existing = statuses.value[guid]
        return existing == null || !(existing.isComplete || existing.isInFlight)
    }

    /**
     * The request behind a finished download, so the player can read its bytes
     * under the key they were stored with. null when it isn't held.
     */
    fun completedRequest(guid: String): DownloadRequest? =
        downloadManager.downloadIndex.getDownload(guid)
            ?.takeIf { it.state == Download.STATE_COMPLETED }
            ?.request

    override fun remove(guid: String) {
        DownloadService.sendRemoveDownload(context, AudioDownloadService::class.java, guid, false)
    }

    /**
     * The housekeeping pass: drop anything heard or older than a week.
     * Runs at launch, and takes the played guids from the caller rather
     * than reading the database itself, so this class stays about files.
     */
    fun purgeExpired(playedGuids: Set<String>) {
        val cutoff = System.currentTimeMillis() - MAXIMUM_AGE_MILLIS
        val cursor = downloadManager.downloadIndex.getDownloads()
        cursor.use {
            while (it.moveToNext()) {
                val download = it.download
                val isManual = String(download.request.data) == String(MANUAL_FLAG)
                // `updateTime` is when the download last changed state,
                // which for a completed one is when it finished — the same
                // thing the iOS app stores as `downloadedAt`.
                val expired = download.updateTimeMs < cutoff
                val heard = download.request.id in playedGuids && !isManual
                if (expired || heard) {
                    Log.i(TAG, "sweeping ${download.request.id} (${if (expired) "week old" else "heard"})")
                    remove(download.request.id)
                }
            }
        }
    }

    private fun refresh() {
        val next = mutableMapOf<String, DownloadStatus>()
        val cursor = downloadManager.downloadIndex.getDownloads()
        cursor.use {
            while (it.moveToNext()) {
                val download = it.download
                next[download.request.id] = DownloadStatus(
                    state = download.state,
                    percent = (download.percentDownloaded.takeIf { p -> p >= 0 } ?: 0f) / 100f,
                )
            }
        }
        _statuses.value = next
    }

    companion object {
        private const val TAG = "Downloads"
        private val MAXIMUM_AGE_MILLIS = 7.days.inWholeMilliseconds
        private val MANUAL_FLAG = "manual".toByteArray()
        private val AUTOMATIC_FLAG = "auto".toByteArray()
    }
}
