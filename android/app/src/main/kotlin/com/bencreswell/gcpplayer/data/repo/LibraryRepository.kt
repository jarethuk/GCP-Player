package com.bencreswell.gcpplayer.data.repo

import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.EpisodePosition
import com.bencreswell.gcpplayer.data.model.ShowEntity
import com.bencreswell.gcpplayer.data.model.ShowWithCounts
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The library, and the local state kept against it.
 *
 * Everything that marks an episode played goes through here, because that
 * is also where its downloaded file is freed — the whole point of holding
 * audio is that you haven't heard it yet.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@Singleton
class LibraryRepository @Inject constructor(
    private val showDao: ShowDao,
    private val episodeDao: EpisodeDao,
    private val downloads: DownloadsRepository,
    private val patreon: PatreonAccount,
) {
    /** Recounted when the token comes or goes: what counts as unplayed depends on it. */
    fun observeShows(): Flow<List<ShowWithCounts>> =
        patreon.hasToken.flatMapLatest { showDao.observeShowsWithCounts(it) }

    fun observeShow(slug: String): Flow<ShowEntity?> = showDao.observeShow(slug)

    fun observeEpisodes(showSlug: String): Flow<List<EpisodeEntity>> =
        episodeDao.observeForShow(showSlug)

    fun observeEpisode(guid: String): Flow<EpisodeEntity?> = episodeDao.observeEpisode(guid)

    suspend fun episode(guid: String): EpisodeEntity? = episodeDao.episode(guid)

    /** The next one this device can play — padlocked episodes are stepped over. */
    suspend fun nextInShow(guid: String): EpisodeEntity? =
        episodeDao.nextInShow(guid, patreon.hasToken())

    /**
     * Where this episode sits in its show — "12 of 45". Counted, not sorted:
     * the position is just how many of the show's episodes came out before
     * this one. null for an episode belonging to no show.
     */
    suspend fun positionInShow(episode: EpisodeEntity): EpisodePosition? {
        val slug = episode.showSlug ?: return null
        val total = episodeDao.countForShow(slug)
        if (total == 0) return null
        return EpisodePosition(episodeDao.countEarlierInShow(episode.guid) + 1, total)
    }

    suspend fun setStarred(slug: String, starred: Boolean) = showDao.setStarred(slug, starred)

    /**
     * Stars a show because something of its was played, unless it already is.
     * Playing an episode is the plainest statement there is that this is a
     * show you follow, so My Shows fills itself in rather than waiting to be
     * told what the listening already says.
     */
    suspend fun starIfNeeded(slug: String) = showDao.starIfNeeded(slug)

    suspend fun setPosition(guid: String, seconds: Double) = episodeDao.setPosition(guid, seconds)

    /**
     * Marks the episode heard and drops its download. Unmarking leaves the
     * file gone — it'll be fetched again on the next play.
     */
    suspend fun setPlayed(guid: String, played: Boolean) {
        episodeDao.setPlayed(guid, played)
        if (played) downloads.remove(guid)
    }

    /** Marks every episode of the same show published before this one. */
    suspend fun markPreviousPlayed(guid: String) {
        val previous = episodeDao.previousUnplayed(guid)
        for (episode in previous) setPlayed(episode.guid, true)
    }
}
