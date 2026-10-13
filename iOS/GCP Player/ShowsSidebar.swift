//
//  ShowsSidebar.swift
//  GCP Player
//
//  The iPad's leading column: every show, always there.
//
//  Two sections rather than the phone's My Shows / All Shows toggle. The
//  toggle exists because a phone has room for one list at a time, and it
//  pays for that by hiding half the catalogue behind a tap. Vertical space
//  is the one thing an iPad has spare, so both are simply shown — which is
//  also what the car does, for the same reason, in CarPlaySceneDelegate.
//
//  A List here, though the rest of the app avoids one: a sidebar is chrome
//  rather than content, selection and keyboard navigation come free with
//  it, and the row inset a List imposes is the correct inset for a
//  sidebar. Its own background is hidden so the app's ink shows through.
//
//  The header is the phone's, down to the gear in its top corner — see
//  ShowsView — so the two lists open the same way.
//

import SwiftUI
import SwiftData

struct ShowsSidebar: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(ShowsModel.self) private var model

    @Query(sort: [SortDescriptor(\Show.latestEpisodeAt, order: .reverse), SortDescriptor(\Show.title)])
    private var shows: [Show]

    @Binding var selection: Show?

    /// The sidebar's one horizontal measure. The header's text, every
    /// cover, the counts down the right and the gear in the corner all sit
    /// on it — the ember rail is the only thing outside it, out in the
    /// margin, so a show with a new episode doesn't have its cover pushed
    /// three points right of its neighbours'.
    private static let gutter: CGFloat = 10

    /// Settings arrives as a sheet rather than a push: in a split view a
    /// pushed Settings would land in the detail column, replacing whatever
    /// the user was listening to their way through.
    @State private var isShowingSettings = false

    private var starred: [Show] { shows.filter(\.isStarred) }

    var body: some View {
        List(selection: $selection) {
            // A row rather than a safeAreaInset: an inset sits in the
            // container's unsafe region, and on iPadOS a windowed app puts
            // its close/resize controls exactly there — which is how the
            // header came to be wearing three traffic lights. A row gets
            // the List's own insets, which already clear them.
            header
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 22, leading: Self.gutter, bottom: 8, trailing: Self.gutter))
                .selectionDisabled()

            if !starred.isEmpty {
                Section {
                    ForEach(starred) { row($0) }
                } header: {
                    sectionHeader(Copy.Shows.myShows)
                }
            }

            Section {
                ForEach(shows) { row($0) }
            } header: {
                sectionHeader(starred.isEmpty ? Copy.Shows.title : Copy.Shows.allShows)
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(Theme.inkDeep)
        .scrollIndicators(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .toolbar(.hidden, for: .navigationBar)
        .refreshable {
            await model.sync(in: modelContext)
        }
        .task {
            await model.sync(in: modelContext)
        }
        .onChange(of: shows.count, initial: true) {
            model.loadCounts(for: shows, in: modelContext)
        }
        // A played mark arriving from the phone moves every count on screen.
        .onChange(of: CloudSyncEngine.shared.lastImportedAt) {
            model.loadCounts(for: shows, in: modelContext)
        }
        .onChange(of: PatreonAccount.shared.changedAt) {
            model.loadCounts(for: shows, in: modelContext)
        }
        .sheet(isPresented: $isShowingSettings) {
            SettingsView()
        }
    }

    /// The app's own header, not a system large title: the display face,
    /// the gradient rule and the gear in the corner are how the phone's
    /// list opens too.
    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                MetaLabel(text: Copy.Shows.eyebrow, showsTick: false, color: Theme.sky)
                Text(Copy.Shows.title)
                    .font(Theme.display(24, relativeTo: .title))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)
                Capsule()
                    .fill(Theme.accentGradient)
                    .frame(width: 44, height: 3)
                    .padding(.top, 1)
            }

            Spacer(minLength: 0)

            // Top-aligned with the eyebrow, like the phone's.
            Button {
                isShowingSettings = true
            } label: {
                CircleIconLabel(systemImage: "gearshape.fill")
            }
            .buttonStyle(.plain)
            .keyboardShortcut(",", modifiers: .command)
            .accessibilityLabel(Copy.Common.settings)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sectionHeader(_ text: String) -> some View {
        MetaLabel(text: text, showsTick: false, color: Theme.muted)
            .padding(.top, 2)
            .padding(.bottom, 2)
            .listRowInsets(EdgeInsets(top: 0, leading: Self.gutter, bottom: 0, trailing: Self.gutter))
    }

    private func row(_ show: Show) -> some View {
        SidebarShowRow(show: show, unplayedCount: model.unplayed(show))
            .tag(show)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            // Leading 0 so the rail can sit on the sidebar's edge; the
            // row's own spacing puts the cover back on the gutter.
            .listRowInsets(EdgeInsets(top: 3, leading: 0, bottom: 3, trailing: Self.gutter))
    }
}

/// A show in the sidebar: cover, title, and how much is unheard.
///
/// The phone's ShowRow drawn small would be the obvious move, but its card
/// — fill, border, radius — says "separate object", and in a sidebar the
/// selection does that job. So the card goes and the rail stays.
private struct SidebarShowRow: View {
    let show: Show
    let unplayedCount: Int

    private var hasNewEpisode: Bool { show.hasNewEpisode(unplayedCount: unplayedCount) }
    private var isLockedNew: Bool { show.hasLockedNewEpisode(unplayedCount: unplayedCount) }

    var body: some View {
        HStack(spacing: 7) {
            // Always here, and clear when there's nothing new: a rail that
            // comes and goes would move every cover beside it.
            Capsule()
                .fill(hasNewEpisode ? Theme.ember : Color.clear)
                .frame(width: 3, height: 34)

            ArtworkView(urlString: show.artworkUrl, size: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(show.title)
                    .font(Theme.display(11, relativeTo: .subheadline))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let system = show.system {
                    Text(system)
                        .font(Theme.body(10, relativeTo: .caption2))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            // The sidebar marks NEW with its rail alone; the padlock takes
            // the trailing edge, where the phone's row puts its chips.
            if isLockedNew {
                PatreonLockChip()
            }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(hasNewEpisode
            ? "\(show.title), \(Copy.Shows.a11yNewEpisodeUnplayed(unplayedCount))"
            : show.title)
    }
}
