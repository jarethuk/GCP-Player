//
//  ShowsView.swift
//  GCP Player
//
//  The root screen on a phone: every show, most recently published first.
//  Runs the sync on launch and on pull-to-refresh.
//
//  On iPad this view isn't used — the same shows appear in ShowsSidebar and
//  ShowsGridView instead, and all three read the same counts and the same
//  sync from ShowsModel. ShowRow, below, is shared with the grid.
//
//  Built on ScrollView rather than List: the network's design is cards on
//  a gradient ground, which a List's own background and row insets fight.
//

import SwiftUI
import SwiftData

struct ShowsView: View {
    @Environment(\.modelContext) private var modelContext

    // A live database query: this list updates automatically as the sync
    // engine inserts shows. Most recently published first — the shows with
    // a new episode waiting are the ones you're looking for.
    @Query(sort: [SortDescriptor(\Show.latestEpisodeAt, order: .reverse), SortDescriptor(\Show.title)])
    private var shows: [Show]

    /// The counts and the sync, shared with the iPad's sidebar and grid.
    @Environment(ShowsModel.self) private var model

    private enum ShowsTab: CaseIterable {
        case myShows
        case allShows

        var label: String {
            switch self {
            case .myShows: Copy.Shows.myShows
            case .allShows: Copy.Shows.allShows
            }
        }
    }

    @State private var tab: ShowsTab = .myShows

    private var hasStarredShows: Bool {
        shows.contains { $0.isStarred }
    }

    private var visibleShows: [Show] {
        if hasStarredShows && tab == .myShows {
            return shows.filter(\.isStarred)
        }
        return shows
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header

                // The tabs only exist once something has been starred.
                if hasStarredShows {
                    SegmentedPicker(
                        options: ShowsTab.allCases.map(\.label),
                        selection: Binding(
                            get: { tab.label },
                            set: { label in tab = ShowsTab.allCases.first { $0.label == label } ?? .myShows }
                        )
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 14)
                }

                LazyVStack(spacing: 8) {
                    ForEach(visibleShows) { show in
                        NavigationLink(value: show) {
                            ShowRow(show: show, unplayedCount: model.unplayed(show))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
            }
        }
        .networkBackground()
        .scrollIndicators(.hidden)
        // No navigation bar on the root: the screen's own header is the
        // title, and an empty bar just reserves space above it.
        .toolbar(.hidden, for: .navigationBar)
        .overlay {
            // Empty-state handling: only relevant before the first
            // successful sync, since data persists after that.
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
        .task {
            // Runs when the view appears. Syncing is idempotent, so doing
            // it every launch is safe — like the daily cron, but on-demand.
            await sync()
        }
        // Recount when syncing adds shows, not while scrolling past them.
        .onChange(of: shows.count, initial: true) {
            model.loadCounts(for: shows, in: modelContext)
        }
        // Coming back from a show, where episodes may have been marked played,
        // or from Settings, which can wipe and refetch the whole catalogue.
        // The counts are a cached derivation, and a reset ends with the same
        // number of shows it started with — so the change above never fires and
        // every count would sit at zero.
        .onAppear {
            model.loadCounts(for: shows, in: modelContext)
        }
        // And when the other device says it played something. These counts
        // are a cached derivation, so an import that changes no *shows*
        // would otherwise leave every badge as it was.
        .onChange(of: CloudSyncEngine.shared.lastImportedAt) {
            model.loadCounts(for: shows, in: modelContext)
        }
        // What counts as new depends on whether Patreon's episodes can play.
        .onChange(of: PatreonAccount.shared.changedAt) {
            model.loadCounts(for: shows, in: modelContext)
        }
        .refreshable {
            await sync()
        }
    }

    /// The network opens every section with a spaced eyebrow over a heavy
    /// display heading and a short gradient rule.
    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                MetaLabel(text: Copy.Shows.eyebrow, showsTick: false, color: Theme.sky)

                Text(Copy.Shows.title)
                    .font(Theme.display(34, relativeTo: .largeTitle))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)

                Capsule()
                    .fill(Theme.accentGradient)
                    .frame(width: 56, height: 3)
                    .padding(.top, 2)
            }

            Spacer(minLength: 0)

            // Top-aligned with the eyebrow, not in a bar of its own.
            NavigationLink(value: SettingsRoute()) {
                CircleIconLabel(systemImage: "gearshape.fill")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Copy.Common.settings)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 18)
    }

    private func sync() async {
        await model.sync(in: modelContext)
    }
}

/// One show: cover, name in display caps, and its game system the way the
/// site sets metadata. A show with something unheard carries a red rail.
struct ShowRow: View {
    let show: Show
    let unplayedCount: Int

    private var hasNewEpisode: Bool { show.hasNewEpisode(unplayedCount: unplayedCount) }
    private var isLockedNew: Bool { show.hasLockedNewEpisode(unplayedCount: unplayedCount) }

    /// The site labels a show by its system, and a show without one goes
    /// without a label. It used to say how many episodes there were, which
    /// is a number nobody was reading.
    private var subtitle: String? { show.system }

    var body: some View {
        HStack(spacing: 12) {
            ArtworkView(urlString: show.artworkUrl, size: 56)

            VStack(alignment: .leading, spacing: 4) {
                Text(show.title)
                    .font(Theme.display(14, relativeTo: .headline))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if let subtitle {
                    MetaLabel(text: subtitle, lineLimit: 2)
                }
            }

            Spacer(minLength: 8)

            if hasNewEpisode {
                Text(Copy.Shows.newChip)
                    .font(Theme.bold(9, relativeTo: .caption2))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Theme.ember, in: RoundedRectangle(cornerRadius: 4))
            } else if isLockedNew {
                PatreonLockChip()
            }
        }
        .padding(.vertical, 9)
        .padding(.leading, hasNewEpisode ? 8 : 11)
        .padding(.trailing, 11)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .leading) {
            // The rail reads as part of the card's edge, so it's clipped
            // to the same shape rather than drawn as a separate bar.
            if hasNewEpisode {
                Theme.ember
                    .frame(width: 3)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.line, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        // The counts are gone from the row, but a screen reader has room
        // for what they said.
        .accessibilityLabel([
            show.title,
            subtitle,
            hasNewEpisode ? Copy.Shows.a11yNewEpisodeUnplayed(unplayedCount) : nil,
            isLockedNew ? Copy.Shows.a11yLockedNew : nil,
        ].compactMap { $0 }.joined(separator: ", "))
    }
}

/// The network's pill toggle: a gradient slug behind the selected option,
/// spaced uppercase labels either side.
struct SegmentedPicker: View {
    let options: [String]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { option in
                let isSelected = option == selection
                Button {
                    selection = option
                } label: {
                    Text(option.uppercased())
                        .font(Theme.bold(10, relativeTo: .caption))
                        .tracking(1.6)
                        .foregroundStyle(isSelected ? Theme.inkDeep : Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background {
                            if isSelected {
                                RoundedRectangle(cornerRadius: 6).fill(Theme.accentGradient)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Theme.inkDeep.opacity(0.7), in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.line, lineWidth: 1)
        }
        .animation(.easeOut(duration: 0.18), value: selection)
    }
}

#Preview {
    NavigationStack {
        ShowsView()
    }
    .environment(ShowsModel())
    .modelContainer(SampleData.previewContainer)
}
