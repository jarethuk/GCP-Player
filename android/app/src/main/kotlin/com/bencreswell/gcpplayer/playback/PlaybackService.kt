package com.bencreswell.gcpplayer.playback

import android.app.PendingIntent
import android.content.Intent
import android.content.res.Resources
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.core.net.toUri
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.bencreswell.gcpplayer.MainActivity
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.artwork.artworkUrl
import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.EpisodePosition
import com.bencreswell.gcpplayer.data.model.durationText
import com.bencreswell.gcpplayer.data.model.isLocked
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.repo.LibraryRepository
import com.bencreswell.gcpplayer.data.settings.SettingsStore
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject

/**
 * The player, as a service.
 *
 * `MediaLibraryService` rather than `MediaSessionService` so the same
 * object also answers Android Auto's browse requests — the equivalent of
 * the iOS app's `CarPlaySceneDelegate`, except the phone and the car drive
 * one player here without the app having to arrange it.
 *
 * Everything that has to happen whether or not a screen is open lives here:
 * saving the position, marking an episode played at the end, advancing
 * through a show, and queueing the downloads.
 */
@UnstableApi
@AndroidEntryPoint
class PlaybackService : MediaLibraryService() {

    @Inject lateinit var downloads: DownloadsRepository
    @Inject lateinit var library: LibraryRepository
    @Inject lateinit var showDao: ShowDao
    @Inject lateinit var episodeDao: EpisodeDao
    @Inject lateinit var settings: SettingsStore
    @Inject lateinit var audio: EpisodeAudio
    @Inject lateinit var patreon: PatreonAccount

    private lateinit var player: ExoPlayer
    private var session: MediaLibrarySession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onCreate() {
        super.onCreate()

        player = ExoPlayer.Builder(this)
            // The cache-backed source is what makes a downloaded episode
            // play from disk without anything asking it to.
            .setMediaSourceFactory(DefaultMediaSourceFactory(downloads.cacheDataSourceFactory))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                // Duck for navigation prompts, pause for a phone call.
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()

        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(openApp)
            // Disabled until something is playing: with no episode loaded
            // there is nothing to advance from.
            .setMediaButtonPreferences(ImmutableList.of(nextEpisodeButton(enabled = false)))
            .build()

        player.addListener(PlaybackListener())
        startPositionSaving()

    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping the app away with nothing playing should stop the
        // service; with something playing it should keep going.
        if (!player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        session?.release()
        session = null
        player.release()
        super.onDestroy()
    }

    // -- Artwork the car can actually draw --------------------------------

    /**
     * The same item with its cover carried *inside* it, rather than left as
     * a URL for the car to fetch.
     *
     * A car's media screen doesn't download remote artwork — an Android
     * Automotive head unit renders `artworkUri` as a coloured placeholder
     * even where the same URL loads fine in the app on the same device, and
     * a car can't be assumed to have a connection at all. Carrying the bytes
     * costs one small JPEG per episode and works wherever the session
     * reaches: the car, the notification, the lock screen.
     *
     * Attached before the player is handed the item rather than swapped in
     * afterwards: a metadata-only `replaceMediaItem` does update the player,
     * but doesn't reach the platform session the car reads.
     */
    private suspend fun withArtwork(item: MediaItem): MediaItem {
        if (item.mediaMetadata.artworkData != null) return item
        val url = item.mediaMetadata.artworkUri?.toString() ?: return item
        val jpeg = artworkBytes(url) ?: return item
        return item.buildUpon()
            .setMediaMetadata(
                item.mediaMetadata.buildUpon()
                    .setArtworkData(jpeg, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
                    .build()
            )
            .build()
    }

    /**
     * The cover as a JPEG, through the same Coil loader the phone's UI uses
     * — so one already on disk costs nothing, and [artworkUrl] keeps the
     * 3000×3000 original off the wire where the CDN will resize for us.
     */
    private suspend fun artworkBytes(url: String): ByteArray? {
        val sized = artworkUrl(url, ARTWORK_PIXELS) ?: return null
        val request = ImageRequest.Builder(this)
            .data(sized)
            .size(ARTWORK_PIXELS)
            // A hardware bitmap can't be read back to compress it.
            .allowHardware(false)
            .build()
        val image = (SingletonImageLoader.get(this).execute(request) as? SuccessResult)?.image
            ?: return null
        return ByteArrayOutputStream().use { out ->
            image.toBitmap().compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }

    // -- Play next episode, in the car -----------------------------------

    /**
     * The car's and the notification's Play Next Episode control.
     *
     * Android Auto's playback screen is a system template: the transport
     * controls are fixed, and anything else has to arrive as a session
     * command button. The player's own next-track control can't carry this
     * — a show is advanced through the database rather than queued, so the
     * player only ever holds the one item and the command is never
     * available. The iOS app does the same thing with a
     * `CPNowPlayingImageButton`.
     */
    private fun nextEpisodeButton(enabled: Boolean): CommandButton =
        CommandButton.Builder(CommandButton.ICON_NEXT)
            .setDisplayName(getString(R.string.player_play_next_episode))
            .setSessionCommand(SessionCommand(ACTION_NEXT_EPISODE, Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
            // Dimmed rather than dropped at the end of a show: a control
            // that comes and goes under a driver's thumb is worse than a
            // dead one.
            .setEnabled(enabled)
            .build()

    /** Marks the current episode played and starts the show's next one. */
    private fun playNextEpisode() {
        val guid = player.currentMediaItem?.mediaId ?: return
        scope.launch {
            val next = library.nextInShow(guid) ?: return@launch
            library.setPlayed(guid, true)
            playEpisode(next)
        }
    }

    /** Keeps the button in step with whether the show has anything left. */
    private fun refreshNextEpisodeButton() {
        val guid = player.currentMediaItem?.mediaId
        scope.launch {
            val hasNext = guid != null && library.nextInShow(guid) != null
            session?.setMediaButtonPreferences(ImmutableList.of(nextEpisodeButton(hasNext)))
        }
    }

    // -- Keeping the database in step with the player --------------------

    private inner class PlaybackListener : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            refreshNextEpisodeButton()
            val guid = mediaItem?.mediaId ?: return
            scope.launch {
                settings.setLastPlayedGuid(guid)
                val episode = library.episode(guid) ?: return@launch
                // Starting something from a show is how a show joins My
                // Shows: the listening says it, so the user doesn't have to.
                // Here rather than in PlayerController because every start
                // arrives here — the phone, the car, and the auto-advance at
                // the end of an episode alike.
                episode.showSlug?.let { library.starIfNeeded(it) }
                val prefs = settings.current()
                // Keep this one for offline, and get the next one ready
                // before the listener arrives at it — both switchable in
                // Settings, both skipping anything already heard. From
                // wherever EpisodeAudio says, which with a Patreon token is
                // Patreon's ad-free copy.
                if (prefs.downloadsCurrentEpisode) audio.download(episode, manual = false)
                if (prefs.downloadsNextEpisode) {
                    library.nextInShow(guid)?.let { next -> audio.download(next, manual = false) }
                }
            }
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state != Player.STATE_ENDED) return
            val guid = player.currentMediaItem?.mediaId ?: return
            scope.launch {
                // The episode finished: mark it played, free its file, and
                // move through the show. Distinguishable from an
                // interruption because ExoPlayer only reports ENDED at the
                // end of the file.
                library.setPlayed(guid, true)
                val next = library.nextInShow(guid)
                if (next != null) playEpisode(next) else player.pause()
            }
        }
    }

    /**
     * Remembers where we are so the next play resumes here — but only every
     * five seconds of drift, to avoid a database write twice a second.
     */
    private fun startPositionSaving() {
        scope.launch {
            var lastSaved = 0L
            while (true) {
                delay(1_000)
                if (!player.isPlaying) continue
                val guid = player.currentMediaItem?.mediaId ?: continue
                val position = player.currentPosition
                if (kotlin.math.abs(position - lastSaved) < 5_000) continue
                lastSaved = position
                library.setPosition(guid, position / 1000.0)
            }
        }
    }

    /**
     * Loads an episode and starts it at wherever it was left. Its audio is
     * looked up first — for a Patreon episode, a round trip to the patron's
     * feed — and an episode with nowhere to play from leaves the player paused.
     */
    private suspend fun playEpisode(episode: EpisodeEntity) {
        val source = audio.sourceOrReport(episode) ?: return player.pause()
        val show = episode.showSlug?.let { slug -> showDao.all().firstOrNull { it.slug == slug } }
        val position = withContext(Dispatchers.IO) { library.positionInShow(episode) }
        val hasToken = patreon.hasToken()
        player.setMediaItem(
            withArtwork(episode.toMediaItem(resources, show?.title, show?.artworkUrl, position, source, hasToken))
        )
        player.prepare()
        if (episode.positionSeconds > 5) {
            player.seekTo((episode.positionSeconds * 1000).toLong())
        }
        player.play()
    }

    // -- The car's browse tree -------------------------------------------

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        /**
         * A controller only gets to send commands it has been offered, and
         * Play Next Episode is ours rather than one of the player's.
         */
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult =
            MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(
                    MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS
                        .buildUpon()
                        .add(SessionCommand(ACTION_NEXT_EPISODE, Bundle.EMPTY))
                        .build()
                )
                .build()

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(browsableItem(ROOT_ID, getString(R.string.shows_title)), params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            val children = withContext(Dispatchers.IO) {
                when {
                    parentId == ROOT_ID -> {
                        val shows = showDao.allByRecency()
                        // Starred shows first, the way "My Shows" does on
                        // the phone — a car screen is no place to scroll.
                        val ordered = shows.sortedByDescending { it.isStarred }
                        ordered.map { browsableItem(SHOW_PREFIX + it.slug, it.title, it.artworkUrl) }
                    }

                    parentId.startsWith(SHOW_PREFIX) -> {
                        val slug = parentId.removePrefix(SHOW_PREFIX)
                        val show = showDao.all().firstOrNull { it.slug == slug }
                        val hasToken = patreon.hasToken()
                        // Padlocked episodes are left out: a driver can't be
                        // sent to Settings to paste a Patreon link, and a row
                        // that does nothing is worse there than anywhere.
                        val all = episodeDao.forShow(slug).filter { !it.isLocked(hasToken) }
                        // Numbered against the whole show, not against what is
                        // listed: "3 of 12" would be a lie the moment the
                        // played ones are filtered out below.
                        val positions = all.withIndex().associate { (index, episode) ->
                            episode.guid to EpisodePosition(index + 1, all.size)
                        }
                        all
                            // Unheard first: what you actually want in a car.
                            .filter { !it.isPlayed }
                            .ifEmpty { all }
                            .map {
                                it.toMediaItem(resources, show?.title, show?.artworkUrl, positions[it.guid], hasToken = hasToken)
                            }
                    }

                    else -> emptyList()
                }
            }
            LibraryResult.ofItemList(ImmutableList.copyOf(children), params)
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> = scope.future {
            val episode = withContext(Dispatchers.IO) { episodeDao.episode(mediaId) }
                ?: return@future LibraryResult.ofError<MediaItem>(SessionError.ERROR_BAD_VALUE)
            val position = withContext(Dispatchers.IO) { library.positionInShow(episode) }
            LibraryResult.ofItem(episode.toMediaItem(resources, null, null, position), null)
        }

        /**
         * The car — and the phone's own controller — hands over a media id,
         * which has to be resolved to something playable and to the position
         * it was left at.
         *
         * Every start passes through here, so this is where the audio is
         * looked up: Patreon's, with a token, via the patron's feed. Only for
         * the item about to play; the rest are resolved when they are reached.
         * An episode with nowhere to play from fails the call, which leaves
         * the player as it was, and EpisodeAudio says why.
         */
        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future {
            val hasToken = patreon.hasToken()
            // `setMediaItem` — which is what the phone's controller calls —
            // arrives with no start index at all, meaning the first item.
            // Taken literally, nothing would be resolved: the item would play
            // as the controller sent it, public URL and all.
            val start = if (startIndex == C.INDEX_UNSET) 0 else startIndex
            val resolved = mediaItems.mapIndexed { index, item ->
                val episode = withContext(Dispatchers.IO) { episodeDao.episode(item.mediaId) }
                    ?: return@mapIndexed item
                val source = if (index == start) {
                    audio.sourceOrReport(episode)
                        ?: throw IllegalStateException("nothing to play ${episode.guid} from")
                } else {
                    null
                }
                val show = episode.showSlug?.let { slug ->
                    withContext(Dispatchers.IO) { showDao.all().firstOrNull { it.slug == slug } }
                }
                val position = withContext(Dispatchers.IO) { library.positionInShow(episode) }
                episode.toMediaItem(resources, show?.title, show?.artworkUrl, position, source, hasToken)
            }
            val resumeAt = if (startPositionMs != C.TIME_UNSET) {
                startPositionMs
            } else {
                val episode = withContext(Dispatchers.IO) {
                    episodeDao.episode(resolved.getOrNull(start)?.mediaId.orEmpty())
                }
                val seconds = episode?.positionSeconds ?: 0.0
                if (seconds > 5) (seconds * 1000).toLong() else 0L
            }
            // Only the one that is about to play: the rest are never shown
            // with their art, and each is a fetch.
            val withCover = resolved.toMutableList()
            withCover.getOrNull(start)?.let { withCover[start] = withArtwork(it) }
            MediaSession.MediaItemsWithStartPosition(withCover, start, resumeAt)
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            Log.d(TAG, "custom command ${customCommand.customAction}")
            if (customCommand.customAction != ACTION_NEXT_EPISODE) {
                return Futures.immediateFuture(SessionResult(SessionError.ERROR_NOT_SUPPORTED))
            }
            playNextEpisode()
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    companion object {
        private const val TAG = "PlaybackService"
        const val ROOT_ID = "root"
        const val ACTION_NEXT_EPISODE = "com.bencreswell.gcpplayer.NEXT_EPISODE"

        /**
         * Big enough for a head unit's now-playing art, small enough that
         * the JPEG travels comfortably inside a binder transaction.
         */
        private const val ARTWORK_PIXELS = 512
        const val SHOW_PREFIX = "show/"
    }
}

/** A folder in the car's browse tree. */
private fun browsableItem(id: String, title: String, artworkUrl: String? = null): MediaItem =
    MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .setArtworkUri(artworkUrl?.let { it.toUri() })
                .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_PODCASTS)
                .build()
        )
        .build()

/**
 * The player's view of an episode. The media id is the guid, which is what
 * lets a media item coming back from the car, the notification or a
 * restored session be matched to a database row.
 *
 * [position] is where the episode sits in its show. The car's now-playing
 * screen is a system template — it has no text of its own and renders whatever
 * the metadata carries — so "12 of 45" has to travel as one of these fields to
 * appear there at all. Album is the one going spare: the show is already the
 * artist, and a podcast episode has no album for this to displace. The iOS app
 * puts it in `MPMediaItemPropertyAlbumTitle` for exactly the same reason.
 */
fun EpisodeEntity.toMediaItem(
    resources: Resources,
    showTitle: String?,
    showArtworkUrl: String?,
    position: EpisodePosition? = null,
    /** Where it plays from, once EpisodeAudio has said; the public URL until then. */
    source: AudioSource? = null,
    hasToken: Boolean = false,
): MediaItem =
    MediaItem.Builder()
        .setMediaId(guid)
        .setUri(source?.url ?: audioUrl)
        .setCustomCacheKey(source?.cacheKey)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(showTitle)
                .setAlbumTitle(position?.format(resources) ?: showTitle)
                // The browse list's second line, which is where the car shows
                // the numbering the phone puts in a chip.
                .setSubtitle(browseDetail(resources, hasToken))
                .setArtworkUri((artworkUrl ?: showArtworkUrl)?.let { it.toUri() })
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
                .build()
        )
        .build()

/**
 * "S1 E38 · 42 min", skipping whatever the episode doesn't have. The phone
 * has room for a chip and a dateline; a car row has one line for both.
 */
private fun EpisodeEntity.browseDetail(resources: Resources, hasToken: Boolean): String {
    val numbering = listOfNotNull(
        season?.let { resources.getString(R.string.episode_season, it) },
        number?.let { resources.getString(R.string.episode_number, it) },
    ).joinToString(" ")
    return listOf(numbering, durationText(resources, hasToken)).filter { it.isNotEmpty() }.joinToString(" · ")
}
