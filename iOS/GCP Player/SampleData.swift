//
//  SampleData.swift
//  GCP Player
//
//  TEMPORARY sample content until real feed syncing lands. Also provides
//  an in-memory database for Xcode previews.
//

import Foundation
import SwiftData

@MainActor
enum SampleData {
    /// Inserts a few shows and episodes. Used on first launch (for now)
    /// and by the preview container below.
    static func seed(into context: ModelContext) {
        let daily = Show(slug: "the-daily-byte", title: "The Daily Byte", system: "Pathfinder 2E")
        let history = Show(slug: "history-uncovered", title: "History Uncovered", system: "Delta Green")
        let science = Show(slug: "science-weekly", title: "Science Weekly")
        context.insert(daily)
        context.insert(history)
        context.insert(science)

        let episodes = [
            Episode(guid: "sample-42", title: "The Answer", rawTitle: "The Answer | The Daily Byte E42 | Pathfinder 2E", episodeDescription: "We finally discover the answer to everything.", audioUrl: "https://example.com/42.mp3", durationSeconds: 42 * 60, publishedAt: Date(timeIntervalSince1970: 1_757_000_000), number: 42, videoUrl: "https://youtu.be/EXAMPLEvideo42", show: daily),
            Episode(guid: "sample-41", title: "The Question", rawTitle: "The Question | The Daily Byte E41 | Pathfinder 2E", episodeDescription: "But what was the question in the first place?", audioUrl: "https://example.com/41.mp3", durationSeconds: 38 * 60, publishedAt: Date(timeIntervalSince1970: 1_756_400_000), number: 41, show: daily),
            Episode(guid: "sample-40", title: "The Setup", rawTitle: "The Setup | The Daily Byte E40 | Pathfinder 2E", episodeDescription: "Where it all began.", audioUrl: "https://example.com/40.mp3", durationSeconds: 45 * 60, publishedAt: Date(timeIntervalSince1970: 1_755_800_000), number: 40, show: daily),
        ]
        for episode in episodes {
            context.insert(episode)
        }
        // One played episode, so previews exercise the Played tab too.
        episodes.last?.isPlayed = true
    }

    /// A throwaway in-memory database for previews — nothing touches disk.
    static let previewContainer: ModelContainer = {
        // cloudKitDatabase: .none for the same reason AppDatabase sets it:
        // the app's iCloud entitlement would otherwise have SwiftData try
        // to mirror this store, and refuse to open it.
        let config = ModelConfiguration(isStoredInMemoryOnly: true, cloudKitDatabase: .none)
        let container = try! ModelContainer(for: Show.self, Episode.self, configurations: config)
        seed(into: container.mainContext)
        return container
    }()

    /// Convenience accessors for previews that need a specific record.
    static var firstShow: Show {
        try! previewContainer.mainContext.fetch(FetchDescriptor<Show>()).first!
    }

    static var firstEpisode: Episode {
        var descriptor = FetchDescriptor<Episode>(sortBy: [SortDescriptor(\.publishedAt, order: .reverse)])
        descriptor.fetchLimit = 1
        return try! previewContainer.mainContext.fetch(descriptor).first!
    }
}
