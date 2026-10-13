//
//  ShowsModel.swift
//  GCP Player
//
//  The shows list's derived state, lifted out of the list itself because
//  three views now want it: the phone's list, the iPad's sidebar, and the
//  poster wall the iPad shows when no show has been picked.
//
//  Two things live here.
//
//  The **unplayed counts**, which are a cache rather than a query. Read
//  off `show.episodes` they would fault every episode of every show while
//  the list scrolls, so they are COUNT queries taken once and kept — and
//  with two views on screen at once, kept somewhere both can see. Nothing
//  displays them any more; they are what the NEW chip asks about, since
//  "new" means published in the last five days *and* not yet heard.
//
//  The **sync**, for the same reason turned the other way round: whatever
//  shows the catalogue owns fetching it, and on iPad two things do. An
//  owner each would mean two syncs on every launch, so there is one here
//  and it refuses to run twice at once.
//

import Foundation
import SwiftData

@MainActor
@Observable
final class ShowsModel {

    /// Unheard episodes per show slug, for the NEW chip.
    private(set) var unplayedCounts: [String: Int] = [:]

    private(set) var isSyncing = false
    private(set) var syncError: String?

    func unplayed(_ show: Show) -> Int { unplayedCounts[show.slug] ?? 0 }

    /// Recounts every show. Cheap — one COUNT per show, 32 of them — and
    /// called on appear, after a sync, and whenever iCloud brings a played
    /// mark in from another device.
    ///
    /// Without a Patreon token, padlocked episodes aren't counted: an early
    /// release nobody here can play is not something new to listen to. With
    /// one, they are. The lists recount when the token changes.
    func loadCounts(for shows: [Show], in context: ModelContext) {
        let includesPatreon = PatreonAccount.shared.hasToken
        var unplayed: [String: Int] = [:]
        for show in shows {
            let slug = show.slug
            let unheard = FetchDescriptor<Episode>(
                predicate: #Predicate {
                    $0.show?.slug == slug && !$0.isPlayed && (includesPatreon || $0.audioUrl != nil)
                }
            )
            unplayed[slug] = (try? context.fetchCount(unheard)) ?? 0
        }
        unplayedCounts = unplayed
    }

    /// Brings the catalogue in line with the API, then recounts.
    ///
    /// Idempotent, and it is meant to be called from more than one place —
    /// the sidebar's pull-to-refresh, the grid appearing, ⌘R. A second
    /// caller while one is in flight is a no-op rather than a second run.
    func sync(in context: ModelContext) async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        do {
            let result = try await SyncEngine.sync(modelContext: context)
            syncError = nil
            // Fetched rather than passed in: ⌘R has no list in hand, and
            // the sync may have just created the shows being counted.
            let shows = (try? context.fetch(FetchDescriptor<Show>())) ?? []
            loadCounts(for: shows, in: context)
            print("[sync] \(result.showsChecked) of \(shows.count) shows checked, episodes +\(result.episodesCreated)/~\(result.episodesUpdated)/-\(result.episodesRemoved), shows +\(result.showsCreated)/-\(result.showsRemoved)")
            if result.parkedStateApplied > 0 {
                print("[sync] \(result.parkedStateApplied) parked iCloud records applied")
            }
            if !result.failedShows.isEmpty {
                print("[sync] shows that failed to sync: \(result.failedShows.joined(separator: ", "))")
            }
        } catch {
            syncError = error.localizedDescription
        }
    }
}
