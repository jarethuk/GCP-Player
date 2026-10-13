//
//  SyncEngine.swift
//  GCP Player
//
//  Brings the local database in line with the catalogue API. Replaces the old
//  FeedSyncEngine, which read the nine RSS feeds and parsed them here — that
//  work now happens once, server-side, instead of once per device.
//
//  Three rules shape this file:
//
//  1. **Local state is never touched.** Played, position and the download
//     bookkeeping belong to this device and the API has never heard of them.
//     Only the catalogue fields are written.
//  2. **Only what changed is asked for.** The API marks a show whenever its
//     episodes change, so the shows a delta returns are exactly the shows
//     worth looking inside. A launch with nothing new is one request.
//  3. **A tombstone is a deletion.** A row that comes back with `deletedAt`
//     set is removed here, along with anything downloaded of it.
//

import Foundation
import SwiftData

struct SyncResult {
    var showsCreated = 0
    var showsRemoved = 0
    /// Shows whose episodes were actually asked for. The rest were unchanged
    /// on the server and cost nothing.
    var showsChecked = 0
    var episodesCreated = 0
    var episodesUpdated = 0
    var episodesRemoved = 0
    /// Shows whose episode delta failed. Their cursors are left alone, so the
    /// next launch asks for the same window again.
    var failedShows: [String] = []
    /// Listening state that had arrived from iCloud for rows this device
    /// didn't have yet, and has now been applied to them.
    var parkedStateApplied = 0
}

@MainActor
enum SyncEngine {

    /// Where the show list's cursor lives. One value for the whole list, unlike
    /// the per-show episode cursors, because the list is one request.
    /// Not private: on tvOS, AppDatabase has to drop it when the store is
    /// purged out from under it.
    static let showsCursorKey = "showsSyncedAt"

    /// Set once this device has fetched the catalogue with Patreon in it.
    ///
    /// A build from before Patreon synced without asking for it, and its
    /// cursors have moved past every Patreon row the API holds — a delta from
    /// them would never mention one. So the first sync after updating starts
    /// every cursor over. It is only a re-download of the catalogue: rows are
    /// matched on guid and slug, and nothing this device owns is touched.
    private static let patreonCatalogueKey = "catalogueIncludesPatreon"

    static func sync(modelContext context: ModelContext) async throws -> SyncResult {
        var result = SyncResult()

        var showsBySlug: [String: Show] = [:]
        for show in try context.fetch(FetchDescriptor<Show>()) {
            showsBySlug[show.slug] = show
        }

        let needsPatreonCatalogue = !UserDefaults.standard.bool(forKey: patreonCatalogueKey)
        if needsPatreonCatalogue {
            UserDefaults.standard.removeObject(forKey: showsCursorKey)
            for show in showsBySlug.values { show.episodesSyncedAt = nil }
        }

        // A cursor with nothing to apply it to would skip the entire catalogue
        // and leave the app permanently empty — so an empty database always
        // asks for everything, whatever the cursor says.
        let storedCursor = UserDefaults.standard.object(forKey: showsCursorKey) as? Date
        let since = showsBySlug.isEmpty ? nil : storedCursor

        // -- Shows ---------------------------------------------------------

        let response = try await APIClient.fetchShows(since: since)
        var changedSlugs: Set<String> = []

        for dto in response.shows {
            guard dto.deletedAt == nil else {
                if let show = showsBySlug[dto.slug] {
                    remove(show, from: context)
                    showsBySlug[dto.slug] = nil
                    result.showsRemoved += 1
                }
                continue
            }

            changedSlugs.insert(dto.slug)

            if let existing = showsBySlug[dto.slug] {
                apply(dto, to: existing)
            } else {
                let show = Show(slug: dto.slug, title: dto.title)
                apply(dto, to: show)
                context.insert(show)
                showsBySlug[dto.slug] = show
                result.showsCreated += 1
            }
        }

        // A full answer is also a complete one: anything held that the server
        // didn't list is gone. Only reachable on a first sync, but it is what
        // recovers a device that missed a tombstone.
        if response.fullResync {
            let listed = Set(response.shows.map(\.slug))
            for (slug, show) in showsBySlug where !listed.contains(slug) {
                remove(show, from: context)
                showsBySlug[slug] = nil
                result.showsRemoved += 1
            }
        }

        try context.save()

        // -- Episodes: a delta for the shows that changed ------------------

        // Plus any show that has never had its episodes fetched — a run that
        // failed partway through would otherwise leave it empty for good.
        let slugs = showsBySlug.values
            .filter { changedSlugs.contains($0.slug) || $0.episodesSyncedAt == nil }
            .map { (slug: $0.slug, since: $0.episodesSyncedAt) }
        result.showsChecked = slugs.count

        // Fetched concurrently — on a first launch this is one request per
        // show, and doing those in sequence would make it feel broken. Applied
        // afterwards, one show at a time, because SwiftData writes belong on
        // the main actor.
        let deltas: [(slug: String, result: Result<EpisodesResponse, Error>)] =
            await withTaskGroup(of: (String, Result<EpisodesResponse, Error>).self) { group in
                for cursor in slugs {
                    group.addTask {
                        do {
                            let response = try await APIClient.fetchEpisodes(
                                showSlug: cursor.slug, since: cursor.since
                            )
                            return (cursor.slug, .success(response))
                        } catch {
                            return (cursor.slug, .failure(error))
                        }
                    }
                }
                var collected: [(String, Result<EpisodesResponse, Error>)] = []
                for await item in group { collected.append(item) }
                return collected
            }

        var episodesByGuid: [String: Episode] = [:]
        for episode in try context.fetch(FetchDescriptor<Episode>()) {
            episodesByGuid[episode.guid] = episode
        }

        for (slug, outcome) in deltas {
            guard let show = showsBySlug[slug] else { continue }

            guard case .success(let delta) = outcome else {
                result.failedShows.append(slug)
                continue
            }

            // Newest publish dates, for the shows list's sort and the NEW chip —
            // of what anyone can play, and of everything including Patreon's.
            // Folded from the delta rather than read off `show.episodes`, which
            // would fault every episode of every show on every launch. A full
            // answer starts from nothing, so a stale value can't outlive it.
            var latestPublic = delta.fullResync ? .distantPast : show.latestPublicEpisodeAt
            var latestAny = delta.fullResync ? .distantPast : show.latestAnyEpisodeAt
            var removedAny = false

            for dto in delta.episodes {
                guard dto.deletedAt == nil else {
                    if let episode = episodesByGuid[dto.guid] {
                        DownloadManager.shared.removeDownload(for: episode)
                        context.delete(episode)
                        episodesByGuid[dto.guid] = nil
                        result.episodesRemoved += 1
                        removedAny = true
                    }
                    continue
                }

                latestAny = max(latestAny, dto.publishedAt)
                if dto.audioUrl != nil {
                    latestPublic = max(latestPublic, dto.publishedAt)
                }

                if let existing = episodesByGuid[dto.guid] {
                    apply(dto, to: existing, show: show)
                    result.episodesUpdated += 1
                } else {
                    let episode = Episode(
                        guid: dto.guid,
                        title: dto.title,
                        rawTitle: dto.rawTitle,
                        audioUrl: dto.audioUrl,
                        publishedAt: dto.publishedAt
                    )
                    apply(dto, to: episode, show: show)
                    context.insert(episode)
                    episodesByGuid[dto.guid] = episode
                    result.episodesCreated += 1
                }
            }

            if removedAny {
                // Folding a maximum can only ever move it forwards, so a
                // deletion has to be recomputed. Worth the fault: it touches
                // one show, and only when something was actually removed —
                // otherwise a deleted latest episode would keep its show at
                // the top of the list, wearing a NEW chip, for days.
                latestAny = show.episodes.map(\.publishedAt).max() ?? .distantPast
                latestPublic = show.episodes.filter { $0.audioUrl != nil }
                    .map(\.publishedAt).max() ?? .distantPast
            }

            show.latestPublicEpisodeAt = latestPublic
            show.latestAnyEpisodeAt = latestAny
            show.refreshLatest()
            // Only after the rows are in hand: a cursor advanced past data that
            // failed to apply would skip it for good.
            show.episodesSyncedAt = delta.syncedAt
        }

        try context.save()

        // Every show, not only those in this delta: cheap, and it brings a
        // store written by an older build, whose `latestEpisodeAt` could be
        // the public date alone, into line without waiting for each show to
        // change.
        for show in showsBySlug.values { show.refreshLatest() }

        // Episodes that didn't exist a moment ago may be ones iCloud has
        // already told us about — this is where that history is claimed.
        result.parkedStateApplied = CloudSyncEngine.shared.applyParkedState(in: context)

        // Last, and only once the shows it describes are committed.
        UserDefaults.standard.set(response.syncedAt, forKey: showsCursorKey)
        if needsPatreonCatalogue && result.failedShows.isEmpty {
            UserDefaults.standard.set(true, forKey: patreonCatalogueKey)
        }

        return result
    }

    /// Throws away everything held locally and fetches it again.
    ///
    /// The escape hatch for a copy that has drifted — a cursor that advanced
    /// past data which never arrived, or anything else that leaves the device
    /// disagreeing with the server. Ordinary syncing cannot repair that,
    /// because a delta is only ever asked for what changed *since* a cursor
    /// this device no longer trusts.
    ///
    /// Everything this device knows and the server doesn't goes with it: what
    /// has been played, where you had got to, starred shows, and every
    /// downloaded file. What is in iCloud survives, though, and comes back
    /// on the way out — the point of the reset is a local copy that has
    /// drifted, not a listening history anyone wants to lose.
    static func clearAndResync(modelContext context: ModelContext) async throws -> SyncResult {
        // Nothing may still be holding a row that is about to be deleted.
        PlayerModel.shared.stop()

        for episode in try context.fetch(FetchDescriptor<Episode>()) {
            // Freed explicitly: the audio is on disk, not in the database, and
            // deleting the row that names a file is what orphans it forever.
            DownloadManager.shared.removeDownload(for: episode)
            context.delete(episode)
        }
        for show in try context.fetch(FetchDescriptor<Show>()) {
            context.delete(show)
        }
        // Including state from iCloud that was waiting for rows which have
        // just been deleted. The re-fetch below brings it back, against the
        // catalogue as it is now.
        for parked in try context.fetch(FetchDescriptor<PendingListeningState>()) {
            context.delete(parked)
        }
        try context.save()

        // The cursor goes too, or the resync asks only for what changed since
        // a catalogue that is no longer here — and gets nothing back. The
        // per-show episode cursors left with their shows.
        UserDefaults.standard.removeObject(forKey: showsCursorKey)

        var result = try await sync(modelContext: context)

        // And the same for iCloud: the change tags went with the rows, so
        // the sync engine is rebuilt from nothing and asked for the whole
        // zone again. Only now the catalogue is back and the state has
        // episodes to attach to.
        result.parkedStateApplied = await CloudSyncEngine.shared.restoreAfterLocalWipe(in: context)

        return result
    }

    // MARK: - Applying one row

    private static func remove(_ show: Show, from context: ModelContext) {
        for episode in show.episodes {
            DownloadManager.shared.removeDownload(for: episode)
            context.delete(episode)
        }
        context.delete(show)
    }

    private static func apply(_ dto: ShowDTO, to show: Show) {
        show.title = dto.title
        show.system = dto.system
        show.artworkUrl = dto.artworkUrl
        show.patreonShowId = dto.patreonShowId
        show.isPublic = dto.isPublic ?? true
        // isStarred and latestEpisodeAt are this device's, and are left alone.
    }

    private static func apply(_ dto: EpisodeDTO, to episode: Episode, show: Show) {
        episode.title = dto.title
        episode.rawTitle = dto.rawTitle
        episode.episodeDescription = dto.description
        episode.audioUrl = dto.audioUrl
        episode.patreonPostId = dto.patreonPostId
        episode.patreonPublishedAt = dto.patreonPublishedAt
        episode.durationSeconds = dto.durationSeconds
        episode.publishedAt = dto.publishedAt
        episode.season = dto.season
        episode.number = dto.number
        episode.artworkUrl = dto.artworkUrl
        episode.videoUrl = dto.videoUrl
        // An episode can be re-attributed on the server — that is one of the
        // main reasons the API is editable — so the relationship is reasserted
        // rather than only set on insert.
        episode.show = show
        // isPlayed, positionSeconds and the download fields are this device's.
    }
}
