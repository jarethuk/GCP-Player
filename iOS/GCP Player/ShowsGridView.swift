//
//  ShowsGridView.swift
//  GCP Player
//
//  What the iPad's detail column shows before a show has been picked.
//
//  The alternative is the usual split-view failure: seven hundred points
//  of empty column saying "Select a show". And there is something better
//  to put there — the network's artwork at the size it was drawn at. The
//  phone has never had room for more than a 56-point thumbnail of it.
//
//  Tiles are covers, because that is how anyone who listens to this
//  network recognises a show. The title sits over a scrim the same way the
//  show screen's hero carries it, and the ember rail means here exactly
//  what it means everywhere else: something published in the last five
//  days that you haven't heard.
//

import SwiftUI
import SwiftData

struct ShowsGridView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(ShowsModel.self) private var model

    @Query(sort: [SortDescriptor(\Show.latestEpisodeAt, order: .reverse), SortDescriptor(\Show.title)])
    private var shows: [Show]

    @Binding var selection: Show?

    /// Adaptive between these: five across a 13-inch landscape column,
    /// two across an 11-inch portrait one, and never a tile so small the
    /// title over it stops being readable.
    private let columns = [GridItem(.adaptive(minimum: 190, maximum: 230), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(shows) { show in
                        Button {
                            selection = show
                        } label: {
                            ShowTile(show: show, unplayedCount: model.unplayed(show))
                        }
                        .buttonStyle(.plain)
                        .hoverEffect(.lift)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 28)
            }
        }
        .networkBackground()
        .scrollIndicators(.hidden)
        .toolbar(.hidden, for: .navigationBar)
        .overlay {
            if shows.isEmpty {
                if model.isSyncing {
                    VStack(spacing: 14) {
                        ProgressView().tint(Theme.sky)
                        MetaLabel(text: Copy.Shows.loading, showsTick: false)
                    }
                } else if let syncError = model.syncError {
                    ContentUnavailableView {
                        Label(Copy.Shows.loadFailed, systemImage: "wifi.slash")
                            .foregroundStyle(Theme.bone)
                    } description: {
                        Text(syncError).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            MetaLabel(text: Copy.Shows.eyebrow, showsTick: false, color: Theme.sky)
            Text(Copy.Shows.gridTitle)
                .font(Theme.display(34, relativeTo: .largeTitle))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
            Capsule()
                .fill(Theme.accentGradient)
                .frame(width: 56, height: 3)
                .padding(.top, 2)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 24)
    }
}

/// One cover, with the show's name over it.
private struct ShowTile: View {
    let show: Show
    let unplayedCount: Int

    private var hasNewEpisode: Bool { show.hasNewEpisode(unplayedCount: unplayedCount) }
    private var isLockedNew: Bool { show.hasLockedNewEpisode(unplayedCount: unplayedCount) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // A clear square sets the cell's shape and the artwork fills
            // it — ArtworkView takes a fixed size, and a grid cell's width
            // isn't known until it is laid out.
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    WideArtworkView(urlString: show.artworkUrl, renderSize: 260)
                }
                .overlay(alignment: .bottom) {
                    // The same scrim treatment as the show screen's hero,
                    // so a tile and the page it opens read as one thing.
                    LinearGradient(
                        colors: [.clear, Theme.inkDeep.opacity(0.92)],
                        startPoint: .center,
                        endPoint: .bottom
                    )
                    .frame(height: 96)
                }
                .overlay(alignment: .bottomLeading) {
                    Text(show.title)
                        .font(Theme.display(13, relativeTo: .headline))
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.bone)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .shadow(color: .black.opacity(0.6), radius: 6, y: 2)
                        .padding(10)
                }
                .overlay(alignment: .topTrailing) {
                    if hasNewEpisode {
                        Text(Copy.Shows.newChip)
                            .font(Theme.bold(9, relativeTo: .caption2))
                            .tracking(1.2)
                            .textCase(.uppercase)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Theme.ember, in: RoundedRectangle(cornerRadius: 4))
                            .padding(8)
                    } else if isLockedNew {
                        PatreonLockChip()
                            // Over artwork, so it needs a ground of its own.
                            .background(Theme.inkDeep.opacity(0.8), in: RoundedRectangle(cornerRadius: 4))
                            .padding(8)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(hasNewEpisode ? Theme.ember.opacity(0.65) : Theme.line, lineWidth: 1)
                }

            if let subtitle {
                MetaLabel(text: subtitle, lineLimit: 1)
                    .padding(.top, 8)
                    .padding(.horizontal, 2)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([
            show.title,
            subtitle,
            hasNewEpisode ? Copy.Shows.a11yNewEpisode : nil,
            isLockedNew ? Copy.Shows.a11yLockedNew : nil,
        ].compactMap { $0 }.joined(separator: ", "))
    }

    /// The system where the feed gives one — the way the site labels a
    /// show — and nothing where it doesn't.
    private var subtitle: String? { show.system }
}
