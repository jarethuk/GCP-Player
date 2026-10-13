//
//  EpisodeActionsMenu.swift
//  GCP Player
//
//  The "…" menu for an episode — used on episode list rows and on the
//  episode screen's toolbar.
//

import SwiftUI
import SwiftData

struct EpisodeActionsMenu: View {
    let episode: Episode

    @Environment(DownloadManager.self) private var downloads

    var body: some View {
        Menu {
            if episode.isDownloaded {
                Button(role: .destructive) {
                    downloads.removeDownload(for: episode)
                } label: {
                    Label(Copy.Actions.removeDownload, systemImage: "trash")
                }
            } else if downloads.isDownloading(episode) {
                // Nothing to do but wait — say so rather than offer a
                // button that would be ignored.
                Label(Copy.Actions.downloading, systemImage: "arrow.down.circle")
            } else if episode.isLocked {
                // Nothing to download without a Patreon token.
                Label(Copy.Actions.patreonOnly, systemImage: "lock")
            } else {
                Button {
                    downloads.downloadIfNeeded(episode, manual: true)
                } label: {
                    Label(Copy.Actions.download, systemImage: "arrow.down.circle")
                }
            }

            WatchOnYouTubeMenuItem(episode: episode)

            Divider()

            Button {
                // markPlayed also frees the downloaded file; unmarking
                // leaves it to be fetched again on next play.
                episode.markPlayed(!episode.isPlayed)
            } label: {
                Label(
                    episode.isPlayed ? Copy.Actions.markUnplayed : Copy.Actions.markPlayed,
                    systemImage: episode.isPlayed ? "circle" : "checkmark.circle"
                )
            }

            Button {
                episode.markAllPreviousPlayed()
            } label: {
                Label(Copy.Actions.markPreviousPlayed, systemImage: "text.badge.checkmark")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
    }
}

#Preview {
    EpisodeActionsMenu(episode: SampleData.firstEpisode)
        .modelContainer(SampleData.previewContainer)
}
