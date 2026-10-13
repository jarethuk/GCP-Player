package com.bencreswell.gcpplayer.playback

import android.content.Context
import android.util.Log
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.isLocked
import com.bencreswell.gcpplayer.data.model.playsFromPatreon
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.patreon.PatreonException
import com.bencreswell.gcpplayer.data.patreon.PatreonFeeds
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Where an episode's audio is read from, and the key its bytes are cached
 * under. A null [cacheKey] means the URL is the key, which is what every
 * public episode has always used — so downloads made before Patreon still
 * play from disk.
 */
data class AudioSource(val url: String, val cacheKey: String? = null)

/**
 * Decides where an episode plays or downloads from: the phone, the car, the
 * auto-advance at the end of an episode and the downloader all ask here, so
 * none of them can disagree.
 *
 *  1. **A finished download**, from its own request — so a downloaded Patreon
 *     episode plays with no network at all, never mind Patreon.
 *  2. **Patreon**, with a token, for anything Patreon carries — the public
 *     episodes too, because Patreon's copy has no ads. The URL and Patreon's
 *     runtime come from the patron's feed at this moment, and the runtime is
 *     kept on the episode. Cached under `patreon:<post id>` rather than the
 *     URL, which carries the token and a signature and is not stable.
 *  3. **The public enclosure**, which is also where a Patreon failure falls
 *     back to when there is one.
 */
@UnstableApi
@Singleton
class EpisodeAudio @Inject constructor(
    private val patreon: PatreonAccount,
    private val feeds: PatreonFeeds,
    private val downloads: DownloadsRepository,
    private val episodeDao: EpisodeDao,
    private val showDao: ShowDao,
    @ApplicationContext private val context: Context,
) {
    private val _lastError = MutableStateFlow<Pair<String, String>?>(null)

    /** The last episode that couldn't start, and why — (guid, message). */
    val lastError: StateFlow<Pair<String, String>?> = _lastError.asStateFlow()

    fun clearError() { _lastError.value = null }

    /** Throws [PatreonException] when there is nowhere to play it from. */
    suspend fun source(episode: EpisodeEntity): AudioSource {
        withContext(Dispatchers.IO) { downloads.completedRequest(episode.guid) }?.let { request ->
            Log.i(TAG, "${episode.guid}: the download")
            return AudioSource(request.uri.toString(), request.customCacheKey)
        }

        val token = patreon.currentToken()
        if (episode.isLocked(token != null)) throw PatreonException.noToken(context.resources)

        if (token != null && episode.playsFromPatreon(hasToken = true)) {
            try {
                val showId = episode.showSlug?.let { slug -> showDao.all().firstOrNull { it.slug == slug } }
                    ?.patreonShowId ?: throw PatreonException.notOnPatreon(context.resources)
                val audio = feeds.audio(token, showId, episode.patreonPostId!!)
                audio.durationSeconds
                    ?.takeIf { it != episode.patreonDurationSeconds }
                    ?.let { episodeDao.setPatreonDuration(episode.guid, it) }
                Log.i(TAG, "${episode.guid}: Patreon")
                return AudioSource(audio.url, cacheKey = "patreon:${episode.patreonPostId}")
            } catch (error: Exception) {
                // An early release has nothing else to fall back on; a public
                // episode still has its public copy, ads and all.
                val fallback = episode.audioUrl ?: throw error
                Log.w(TAG, "Patreon failed for ${episode.guid}; playing the public copy", error)
                return AudioSource(fallback)
            }
        }

        Log.i(TAG, "${episode.guid}: the public feed")
        return AudioSource(episode.audioUrl ?: throw PatreonException.notOnPatreon(context.resources))
    }

    /** [source], recording a failure for the screen rather than throwing. */
    suspend fun sourceOrReport(episode: EpisodeEntity): AudioSource? =
        runCatching { source(episode) }
            .onSuccess { _lastError.value = null }
            .onFailure { _lastError.value = episode.guid to (it.message ?: context.getString(R.string.errors_play_failed)) }
            .getOrNull()

    /**
     * Starts a download from wherever [source] says. Automatic downloads skip
     * anything padlocked, heard, held or already running; the checks that
     * need no network happen first.
     */
    suspend fun download(episode: EpisodeEntity, manual: Boolean) {
        if (!downloads.shouldDownload(episode.guid)) return
        if (!manual && episode.isPlayed) return
        val source = runCatching { source(episode) }.getOrElse {
            Log.w(TAG, "can't download ${episode.guid}: ${it.message}")
            return
        }
        downloads.download(episode.guid, source, manual)
    }

    private companion object {
        const val TAG = "EpisodeAudio"
    }
}
