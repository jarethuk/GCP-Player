package com.bencreswell.gcpplayer.data.sync

import android.util.Log
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.data.api.Catalogue
import com.bencreswell.gcpplayer.data.api.EpisodeDto
import com.bencreswell.gcpplayer.data.api.EpisodesResponse
import com.bencreswell.gcpplayer.data.api.ShowDto
import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.ShowEntity
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.settings.SettingsStore
import com.bencreswell.gcpplayer.playback.DownloadEraser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import javax.inject.Inject
import javax.inject.Singleton

data class SyncResult(
    val showsCreated: Int = 0,
    val showsRemoved: Int = 0,
    /**
     * Shows whose episodes were actually asked for. The rest were unchanged on
     * the server and cost nothing.
     */
    val showsChecked: Int = 0,
    val episodesCreated: Int = 0,
    val episodesUpdated: Int = 0,
    val episodesRemoved: Int = 0,
    /**
     * Shows whose episode delta failed. Their cursors are left alone, so the
     * next launch asks for the same window again.
     */
    val failedShows: List<String> = emptyList(),
)

/**
 * Brings the local database in line with the catalogue API. Replaces
 * `FeedSyncEngine`, which read the network's nine RSS feeds and parsed them
 * here — that work now happens once, server-side, instead of once per device.
 *
 * A port of `iOS/GCP Player/SyncEngine.swift`, and the same three rules shape
 * both:
 *
 *  1. **Local state is never touched.** Played, position, starred and the
 *     download bookkeeping belong to this device and the API has never heard
 *     of them. Only the catalogue fields are written.
 *  2. **Only what changed is asked for.** The API marks a show whenever its
 *     episodes change, so the shows a delta returns are exactly the shows
 *     worth looking inside. A launch with nothing new is one request.
 *  3. **A tombstone is a deletion.** A row that comes back with `deletedAt`
 *     set is removed here, along with anything downloaded of it.
 *
 * The structural difference from iOS is Room's: SwiftData mutates live objects
 * and saves the graph, so this reads what it needs into maps, works on plain
 * copies, and writes back in batched upserts.
 */
@UnstableApi
@Singleton
class SyncEngine @Inject constructor(
    private val api: Catalogue,
    private val showDao: ShowDao,
    private val episodeDao: EpisodeDao,
    private val downloads: DownloadEraser,
    private val settings: SettingsStore,
    private val patreon: PatreonAccount,
) {

    /**
     * Syncs against the stored cursor, and stores the new one.
     *
     * A cursor with nothing to apply it to would skip the entire catalogue and
     * leave the app permanently empty — so an empty database always asks for
     * everything, whatever the cursor says.
     */
    suspend fun sync(): SyncResult {
        // Before anything that can fail offline: a database migrated to the
        // Patreon schema arrives with every listing date at 0, and every
        // listing-order query — the next episode above all — reads them.
        episodeDao.refreshListedAt(patreon.hasToken())

        // The first sync after updating to a build that knows Patreon starts
        // every cursor over: the old build synced without asking for Patreon,
        // and its cursors have moved past every Patreon row the API holds. It
        // is only a re-download of the catalogue — rows are matched on guid and
        // slug, and nothing this device owns is touched.
        val needsPatreonCatalogue = !settings.catalogueIncludesPatreon()
        if (needsPatreonCatalogue) {
            showDao.upsert(showDao.all().map { it.copy(episodesSyncedAt = null) })
        }

        val since = if (showDao.all().isEmpty() || needsPatreonCatalogue) null else settings.showsSyncedAt()
        val (result, cursor) = apply(since)
        // Last, and only once the shows it describes are committed.
        settings.setShowsSyncedAt(cursor)
        if (needsPatreonCatalogue && result.failedShows.isEmpty()) settings.setCatalogueIncludesPatreon()
        return result
    }

    /**
     * Split from [sync] so the database logic can be exercised with any cursor
     * and any set of answers, no networking or device settings required.
     *
     * Returns the cursor the caller should store — which is the server's, not
     * a clock reading, and not stored here because it must not advance past
     * rows that failed to commit.
     */
    suspend fun apply(since: Long?): Pair<SyncResult, Long> {
        var showsCreated = 0
        var showsRemoved = 0
        var episodesCreated = 0
        var episodesUpdated = 0
        var episodesRemoved = 0
        val failedShows = mutableListOf<String>()

        val showsBySlug = showDao.all().associateBy { it.slug }.toMutableMap()

        // -- Shows -------------------------------------------------------

        val response = api.shows(since)
        val changedSlugs = mutableSetOf<String>()
        val removedSlugs = mutableListOf<String>()

        for (dto in response.shows) {
            if (dto.deletedAt != null) {
                if (showsBySlug.remove(dto.slug) != null) {
                    removedSlugs += dto.slug
                    showsRemoved++
                }
                continue
            }

            changedSlugs += dto.slug
            val existing = showsBySlug[dto.slug]
            if (existing == null) showsCreated++
            showsBySlug[dto.slug] = existing.orNew(dto).applying(dto)
        }

        // A full answer is also a complete one: anything held that the server
        // didn't list is gone. Only reachable on a first sync, but it is what
        // recovers a device that missed a tombstone.
        if (response.fullResync) {
            val listed = response.shows.map { it.slug }.toSet()
            for (slug in showsBySlug.keys.toList()) {
                if (slug in listed) continue
                showsBySlug.remove(slug)
                removedSlugs += slug
                showsRemoved++
            }
        }

        // Before the delete, so the files of episodes about to be cascaded away
        // are freed rather than orphaned on disk.
        for (slug in removedSlugs) {
            for (episode in episodeDao.forShow(slug)) downloads.remove(episode.guid)
            episodeDao.delete(episodeDao.forShow(slug).map { it.guid })
        }
        showDao.upsert(showsBySlug.values.toList())
        if (removedSlugs.isNotEmpty()) showDao.delete(removedSlugs)

        // -- Episodes: a delta for the shows that changed ----------------

        // Plus any show that has never had its episodes fetched — a run that
        // failed partway through would otherwise leave it empty for good.
        val pending = showsBySlug.values
            .filter { it.slug in changedSlugs || it.episodesSyncedAt == null }
        val deltas = fetchEpisodes(pending)

        val episodesByGuid = episodeDao.all().associateBy { it.guid }.toMutableMap()
        val episodeWrites = mutableListOf<EpisodeEntity>()
        val showWrites = mutableListOf<ShowEntity>()

        for ((slug, outcome) in deltas) {
            val show = showsBySlug[slug] ?: continue
            val delta = outcome.getOrElse {
                Log.w(TAG, "episodes for $slug failed", it)
                failedShows += slug
                continue
            }

            // Newest publish dates, for the shows list's sort and the NEW chip —
            // of everything including Patreon's, and of what anyone can play.
            // Folded from the delta rather than read back off the table, which
            // would be a query per show on every launch. A full answer starts
            // from nothing, so a stale value can't outlive it.
            var latest = if (delta.fullResync) Long.MIN_VALUE else show.latestEpisodeAt
            var latestPublic = if (delta.fullResync) Long.MIN_VALUE else show.latestPublicEpisodeAt
            var removedAny = false

            for (dto in delta.episodes) {
                if (dto.deletedAt != null) {
                    val existing = episodesByGuid.remove(dto.guid) ?: continue
                    downloads.remove(existing.guid)
                    episodeDao.delete(listOf(existing.guid))
                    episodesRemoved++
                    removedAny = true
                    continue
                }

                latest = maxOf(latest, dto.publishedAt)
                if (dto.audioUrl != null) latestPublic = maxOf(latestPublic, dto.publishedAt)
                val existing = episodesByGuid[dto.guid]
                if (existing == null) episodesCreated++ else episodesUpdated++
                val row = existing.orNew(dto).applying(dto, slug)
                episodesByGuid[dto.guid] = row
                episodeWrites += row
            }

            if (removedAny) {
                // Folding a maximum can only ever move it forwards, so a
                // deletion has to be recomputed. One query, and only when
                // something was actually removed — otherwise a deleted latest
                // episode would keep its show at the top of the list, wearing a
                // NEW chip, for days.
                latest = episodeDao.latestPublishedAt(slug) ?: Long.MIN_VALUE
                latestPublic = episodeDao.latestPublicPublishedAt(slug) ?: Long.MIN_VALUE
            }

            showWrites += show.copy(
                latestEpisodeAt = latest,
                latestPublicEpisodeAt = latestPublic,
                // Only after the rows are in hand: a cursor advanced past data
                // that failed to apply would skip it for good.
                episodesSyncedAt = delta.syncedAt,
            )
        }

        if (episodeWrites.isNotEmpty()) episodeDao.upsert(episodeWrites)
        if (showWrites.isNotEmpty()) showDao.upsert(showWrites)
        // The rows just written carry their public date; a patron lists them by
        // Patreon's.
        episodeDao.refreshListedAt(patreon.hasToken())

        val result = SyncResult(
            showsCreated = showsCreated,
            showsRemoved = showsRemoved,
            showsChecked = pending.size,
            episodesCreated = episodesCreated,
            episodesUpdated = episodesUpdated,
            episodesRemoved = episodesRemoved,
            failedShows = failedShows,
        )
        Log.i(
            TAG,
            "${result.showsChecked} shows checked, +${result.episodesCreated} episodes, " +
                "${result.episodesUpdated} updated, ${result.episodesRemoved} removed, " +
                "${result.showsCreated} new shows, ${result.showsRemoved} gone",
        )
        return result to response.syncedAt
    }

    /**
     * Throws away everything held locally and fetches it again.
     *
     * The escape hatch for a copy that has drifted — a cursor that advanced
     * past data which never arrived, or anything else that leaves the device
     * disagreeing with the server. Ordinary syncing cannot repair that, because
     * a delta is only ever asked for what changed *since* a cursor this device
     * no longer trusts.
     *
     * Everything this device knows and the server doesn't goes with it: what
     * has been played, where you had got to, starred shows, and every
     * downloaded file. The caller is expected to have stopped playback first —
     * nothing may still be holding a row that is about to be deleted.
     */
    suspend fun clearAndResync(): SyncResult {
        for (episode in episodeDao.all()) {
            // Freed explicitly: the audio is in Media3's download cache, not in
            // the database, and deleting the row that names a file is what
            // orphans it forever.
            downloads.remove(episode.guid)
        }
        episodeDao.deleteAll()
        showDao.deleteAll()
        // The cursor goes too, or the resync asks only for what changed since a
        // catalogue that is no longer here — and gets nothing back. The
        // per-show episode cursors left with their shows.
        settings.clearShowsSyncedAt()
        return sync()
    }

    /**
     * Fetched concurrently — on a first launch this is one request per show,
     * and doing those in sequence would make it feel broken.
     */
    private suspend fun fetchEpisodes(
        shows: List<ShowEntity>,
    ): List<Pair<String, Result<EpisodesResponse>>> = coroutineScope {
        shows.map { show ->
            async(Dispatchers.IO) {
                show.slug to runCatching { api.episodes(show.slug, show.episodesSyncedAt) }
            }
        }.awaitAll()
    }

    private companion object {
        const val TAG = "Sync"
    }
}

// -- Applying one row ----------------------------------------------------

private fun ShowEntity?.orNew(dto: ShowDto): ShowEntity =
    this ?: ShowEntity(slug = dto.slug, title = dto.title)

/** isStarred, latestEpisodeAt and episodesSyncedAt are this device's. */
private fun ShowEntity.applying(dto: ShowDto): ShowEntity = copy(
    title = dto.title,
    system = dto.system,
    artworkUrl = dto.artworkUrl,
    patreonShowId = dto.patreonShowId,
    isPublic = dto.isPublic,
)

private fun EpisodeEntity?.orNew(dto: EpisodeDto): EpisodeEntity =
    this ?: EpisodeEntity(
        guid = dto.guid,
        title = dto.title,
        rawTitle = dto.rawTitle,
        audioUrl = dto.audioUrl,
        publishedAt = dto.publishedAt,
    )

/** isPlayed, positionSeconds and patreonDurationSeconds are this device's. */
private fun EpisodeEntity.applying(dto: EpisodeDto, showSlug: String): EpisodeEntity = copy(
    title = dto.title,
    rawTitle = dto.rawTitle,
    description = dto.description,
    audioUrl = dto.audioUrl,
    patreonPostId = dto.patreonPostId,
    patreonPublishedAt = dto.patreonPublishedAt,
    durationSeconds = dto.durationSeconds,
    publishedAt = dto.publishedAt,
    season = dto.season,
    number = dto.number,
    artworkUrl = dto.artworkUrl,
    videoUrl = dto.videoUrl,
    // An episode can be re-attributed on the server — that is one of the main
    // reasons the API is editable — so this is reasserted rather than only set
    // on insert.
    showSlug = showSlug,
)
