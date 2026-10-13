package com.bencreswell.gcpplayer.playback

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.EpisodePosition
import com.bencreswell.gcpplayer.data.model.effectiveDurationSeconds
import com.bencreswell.gcpplayer.data.model.isLocked
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.repo.LibraryRepository
import com.bencreswell.gcpplayer.data.settings.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/** Everything a screen needs to draw the player. */
data class PlaybackState(
    val episode: EpisodeEntity? = null,
    val showTitle: String? = null,
    val showSlug: String? = null,
    val artworkUrl: String? = null,
    /** "12 of 45" — where this episode sits in its show. */
    val positionInShow: EpisodePosition? = null,
    val isPlaying: Boolean = false,
    val positionSeconds: Double = 0.0,
    val durationSeconds: Double = 0.0,
    /**
     * Asked to play and not playing yet: the audio is being looked up — for a
     * Patreon episode a round trip to the patron's feed — or is buffering.
     */
    val isPreparing: Boolean = false,
    /** Why the last play of [episode] didn't start, for the screen to say. */
    val error: String? = null,
)

/**
 * What the UI talks to. The player itself lives in [PlaybackService]; this
 * is a `MediaController` bound to its session, which is the same channel
 * the notification and the car use — so there is exactly one player and no
 * second copy of "what's playing" to keep in step.
 *
 * The iOS app's `PlayerModel` is both halves at once, because an iOS app is
 * one process with one `AVPlayer`. Splitting them here is Android's shape,
 * not a change of design.
 */
@UnstableApi
@Singleton
class PlayerController @Inject constructor(
    private val context: Context,
    private val library: LibraryRepository,
    private val showDao: ShowDao,
    private val settings: SettingsStore,
    private val patreon: PatreonAccount,
    private val audio: EpisodeAudio,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var controller: MediaController? = null

    private val _state = MutableStateFlow(PlaybackState())
    val state: StateFlow<PlaybackState> = _state.asStateFlow()

    /**
     * While the user is dragging the scrubber we show *their* position, not
     * the player's — otherwise the twice-a-second updates would yank the
     * thumb out of their finger. null = not scrubbing.
     */
    private val _scrubSeconds = MutableStateFlow<Double?>(null)
    val scrubSeconds: StateFlow<Double?> = _scrubSeconds.asStateFlow()

    fun connect() {
        if (controller != null) return
        scope.launch {
            val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
            val media = MediaController.Builder(context, token).buildAsync().await()
            controller = media
            media.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = publish()
            })
            // Bring back whatever was playing when the app was last used,
            // so the mini player is waiting where the user left it — paused,
            // with nothing loaded or downloaded until they press play.
            if (media.currentMediaItem == null) restoreLastEpisode()
            publish()
            startPolling()
        }
        // The service's lookups fail here, not in the controller: say so.
        scope.launch { audio.lastError.collect { publish() } }
    }

    fun release() {
        controller?.release()
        controller = null
    }

    // -- Controls --------------------------------------------------------

    fun play(episode: EpisodeEntity) {
        scope.launch {
            val media = controller ?: return@launch
            // Padlocked: Patreon's alone, and no token to reach it with. The
            // screens don't offer play for these, but a stale row still can.
            if (episode.isLocked(patreon.hasToken())) return@launch
            audio.clearError()
            // Into the player's state now, so the tap visibly did something
            // while the audio is looked up.
            attach(episode)
            val show = episode.showSlug?.let { slug ->
                withContext(Dispatchers.IO) { showDao.all().firstOrNull { it.slug == slug } }
            }
            val position = withContext(Dispatchers.IO) { library.positionInShow(episode) }
            media.setMediaItem(episode.toMediaItem(context.resources, show?.title, show?.artworkUrl, position))
            media.prepare()
            // Resume where this episode was left off, unless it's
            // effectively at the start anyway.
            if (episode.positionSeconds > 5) {
                media.seekTo((episode.positionSeconds * 1000).toLong())
            }
            media.play()
            publish()
        }
    }

    fun togglePlayPause() {
        val media = controller ?: return
        if (media.isPlaying) {
            media.pause()
            // Write the position now rather than waiting for the service's
            // next save: a pause is where a listener stops and leaves.
            val guid = media.currentMediaItem?.mediaId
            if (guid != null) {
                scope.launch { library.setPosition(guid, media.currentPosition / 1000.0) }
            }
        } else {
            // A restored episode has nothing loaded yet — start it properly,
            // which picks up its saved position.
            val episode = _state.value.episode
            if (media.currentMediaItem == null && episode != null) play(episode) else media.play()
        }
        publish()
    }

    fun seekTo(seconds: Double) {
        controller?.seekTo((seconds * 1000).toLong())
        _scrubSeconds.value = null
        publish()
    }

    fun scrubTo(seconds: Double) {
        _scrubSeconds.value = seconds
    }

    /** Skip forward (positive) or back (negative) by a number of seconds. */
    fun skip(seconds: Double) {
        val media = controller ?: return
        val target = (media.currentPosition + seconds * 1000).coerceAtLeast(0.0)
        media.seekTo(target.toLong())
        publish()
    }

    /** Marks the current episode played and starts the show's next one. */
    /**
     * Unloads whatever is playing and forgets it.
     *
     * Used before the library is wiped and refetched: the player holds a media
     * id that is about to stop existing, and the mini bar would otherwise sit
     * there naming a row that has gone.
     */
    fun stop() {
        val media = controller ?: return
        media.stop()
        media.clearMediaItems()
        _state.value = PlaybackState()
    }

    fun playNext() {
        val guid = _state.value.episode?.guid ?: return
        scope.launch {
            val next = library.nextInShow(guid) ?: return@launch
            library.setPlayed(guid, true)
            play(next)
        }
    }

    // -- State -----------------------------------------------------------

    private fun startPolling() {
        scope.launch {
            while (true) {
                delay(500)
                if (controller?.isPlaying == true || _state.value.positionSeconds == 0.0) publish()
            }
        }
    }

    private fun publish() {
        val media = controller ?: return
        val guid = media.currentMediaItem?.mediaId
        val position = (media.currentPosition / 1000.0).coerceAtLeast(0.0)
        val reported = media.duration.takeIf { it > 0 }?.let { it / 1000.0 }

        val failure = audio.lastError.value
        _state.value = _state.value.copy(
            isPlaying = media.isPlaying,
            positionSeconds = if (guid == _state.value.episode?.guid) position else 0.0,
            // The feed's duration until the file's headers give up the real
            // one; a podcast feed's claim is often a few seconds out.
            durationSeconds = reported ?: _state.value.durationSeconds,
            isPreparing = media.playWhenReady && !media.isPlaying &&
                (media.playbackState == Player.STATE_BUFFERING || media.playbackState == Player.STATE_IDLE) &&
                failure == null,
            error = failure?.takeIf { it.first == _state.value.episode?.guid }?.second,
        )

        if (guid != null && guid != _state.value.episode?.guid) loadEpisode(guid)
    }

    private fun loadEpisode(guid: String) {
        scope.launch {
            val episode = withContext(Dispatchers.IO) { library.episode(guid) } ?: return@launch
            attach(episode)
        }
    }

    private suspend fun attach(episode: EpisodeEntity) {
        val show = episode.showSlug?.let { slug ->
            withContext(Dispatchers.IO) { showDao.all().firstOrNull { it.slug == slug } }
        }
        val position = withContext(Dispatchers.IO) { library.positionInShow(episode) }
        val isNew = _state.value.episode?.guid != episode.guid
        _state.value = _state.value.copy(
            episode = episode,
            showTitle = show?.title,
            showSlug = show?.slug,
            artworkUrl = episode.artworkUrl ?: show?.artworkUrl,
            positionInShow = position,
            // Patreon's runtime when that is the copy playing.
            durationSeconds = _state.value.durationSeconds.takeIf { it > 0 && !isNew }
                ?: (episode.effectiveDurationSeconds(patreon.hasToken())?.toDouble() ?: 0.0),
        )
    }

    private suspend fun restoreLastEpisode() {
        val guid = settings.lastPlayedGuid.first() ?: return
        // The episode can legitimately be gone — a feed can drop items.
        val episode = withContext(Dispatchers.IO) { library.episode(guid) } ?: return
        attach(episode)
        _state.value = _state.value.copy(positionSeconds = episode.positionSeconds)
    }
}

/** Convenience for the screens: is this the episode currently loaded? */
fun PlaybackState.isCurrent(episode: EpisodeEntity): Boolean = this.episode?.guid == episode.guid

/** 754 seconds → "12:34"; over an hour → "1:02:04". */
fun formatTime(seconds: Double, showHours: Boolean): String {
    val total = seconds.coerceAtLeast(0.0).toLong()
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (showHours) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(total / 60, s)
}
