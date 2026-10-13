//
//  ShowView.swift
//  GCP Player
//
//  A single show: full-bleed hero artwork (extending behind the status
//  bar), played/unplayed tabs, and episodes in listening order.
//
//  Built on ScrollView rather than List: a List row can't escape the
//  safe area, but a ScrollView can ignore it, letting the artwork sit
//  behind the navigation/status bars.
//

import SwiftUI
import SwiftData

struct ShowView: View {
    @Environment(PlayerModel.self) private var player
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    let show: Show

    /// A phone or a narrow split; anything else is an iPad with room.
    private var isRegular: Bool { horizontalSizeClass == .regular }

    private enum PlayedFilter: CaseIterable {
        case unplayed
        case played

        var label: String {
            switch self {
            case .unplayed: Copy.Show.unplayed
            case .played: Copy.Show.played
            }
        }
    }

    @State private var filter: PlayedFilter = .unplayed

    /// Taller where there is more of it to fill. The artwork is the show's
    /// identity and a detail column is wide enough to be worth it.
    private var heroHeight: CGFloat { isRegular ? 380 : 320 }

    /// The episode list stops here, centred, however wide the column is.
    /// A title set across 900 points is unreadable, and the row's
    /// chip-title-menu rhythm comes apart when its middle stretches — so
    /// the hero runs full bleed and the list does not.
    private var contentWidth: CGFloat { isRegular ? 760 : .infinity }

    // Oldest first — the order you'd listen to a campaign in.
    private var episodes: [Episode] {
        show.episodes
            .filter { (filter == .played) == $0.isPlayed }
            .sorted { $0.listedAt < $1.listedAt }
    }

    /// The widest numbering in the show, as a string of zeroes — "E000" for a
    /// show that reaches three figures.
    ///
    /// Every chip reserves this much, so they are all one size and none of them
    /// wraps. Taken from `show.episodes` rather than the filtered list above,
    /// or the chips would resize as you flip between played and unplayed.
    ///
    /// Zeroes rather than the real maximum because in a proportional face "0"
    /// is the widest digit, so this is the conservative reservation.
    private var chipTemplate: (season: String?, number: String) {
        func widest(_ values: [Int], _ label: (Int) -> String) -> String? {
            values.max().map {
                label(0).replacingOccurrences(of: "0", with: String(repeating: "0", count: String($0).count))
            }
        }
        return (
            widest(show.episodes.compactMap(\.season), Copy.Episode.season),
            // "E0" even for a show with no numbers at all: an unnumbered
            // episode still reserves the space, so its title lines up with a
            // numbered one's in a show that mixes the two.
            widest(show.episodes.compactMap(\.number), Copy.Episode.number) ?? Copy.Episode.number(0)
        )
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroHeader

                VStack(spacing: 0) {
                SegmentedPicker(
                    options: PlayedFilter.allCases.map(\.label),
                    selection: Binding(
                        get: { filter.label },
                        set: { label in filter = PlayedFilter.allCases.first { $0.label == label } ?? .unplayed }
                    )
                )
                .padding(.horizontal, 14)
                .padding(.vertical, 12)

                if episodes.isEmpty {
                    ContentUnavailableView {
                        Label(
                            filter == .unplayed ? Copy.Show.allCaughtUp : Copy.Show.nothingPlayed,
                            systemImage: filter == .unplayed ? "checkmark.circle" : "circle"
                        )
                        .foregroundStyle(Theme.bone)
                    }
                    .padding(.top, 40)
                }

                LazyVStack(spacing: 0) {
                    ForEach(episodes) { episode in
                        episodeRow(episode)
                        Rectangle()
                            .fill(Theme.line)
                            .frame(height: 1)
                            .padding(.horizontal, 16)
                    }
                }
                }
                .frame(maxWidth: contentWidth)
                .frame(maxWidth: .infinity)
            }
        }
        // Flat ink rather than the ground gradient: the hero's scrim fades
        // into the page, and a gradient behind it would show the seam.
        .background(Theme.ink.ignoresSafeArea())
        .scrollIndicators(.hidden)
        // This is what lets the artwork extend behind the status bar and
        // the (transparent) navigation bar.
        .ignoresSafeArea(edges: .top)
        // The hero carries the show name now, so the bar stays empty.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem {
                Button {
                    show.setStarred(!show.isStarred)
                } label: {
                    Image(systemName: show.isStarred ? "star.fill" : "star")
                        .foregroundStyle(show.isStarred ? Theme.sky : Theme.bone)
                }
            }
        }
    }

    /// The artwork, pinned to the very top. When the user pulls down past
    /// the top ("overscroll"), it stretches to fill instead of revealing a
    /// gap — the classic stretchy-header effect. A scrim carries the show
    /// name in display caps, the way the site titles a show over its art.
    private var heroHeader: some View {
        GeometryReader { geometry in
            // How far the header has been dragged below its resting place.
            let stretch = max(0, geometry.frame(in: .scrollView).minY)

            // The square source has to cover a full-width rectangle, so
            // decode to the wider of the two edges.
            WideArtworkView(urlString: show.artworkUrl, renderSize: max(geometry.size.width, heroHeight))
                .frame(width: geometry.size.width, height: heroHeight + stretch)
                .overlay {
                    LinearGradient(
                        stops: [
                            .init(color: Theme.ink.opacity(0.05), location: 0),
                            .init(color: Theme.ink.opacity(0.72), location: 0.62),
                            .init(color: Theme.ink, location: 0.97),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .overlay(alignment: .bottom) { heroFooter }
                .clipped()
                .offset(y: -stretch)
        }
        .frame(height: heroHeight)
    }

    /// The title, and — where there's width for it — the thing you
    /// actually opened the show to do. On a phone this sits under the
    /// title as the first unplayed row anyway; on an iPad the list can be
    /// sixty rows long before it reaches one.
    @ViewBuilder
    private var heroFooter: some View {
        if isRegular, let next = show.nextUnplayed {
            HStack(alignment: .bottom, spacing: 16) {
                heroTitle
                Spacer(minLength: 8)
                playNextButton(next)
                    .padding(.trailing, 16)
                    .padding(.bottom, 12)
            }
        } else {
            HStack {
                heroTitle
                Spacer(minLength: 0)
            }
        }
    }

    /// The gradient, which in this app marks the thing that plays and
    /// nothing else.
    private func playNextButton(_ episode: Episode) -> some View {
        Button {
            player.play(episode)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "play.fill")
                Text(Copy.Show.playNextUnplayed.uppercased())
                    .tracking(1.6)
            }
            .font(Theme.bold(11, relativeTo: .headline))
            .foregroundStyle(Theme.inkDeep)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
        .accessibilityLabel(Copy.Show.a11yPlayEpisode(episode.title))
    }

    private var heroTitle: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(show.title)
                .font(Theme.display(26, relativeTo: .title))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
                .lineLimit(3)
                .multilineTextAlignment(.leading)

            if let system = show.system {
                MetaLabel(text: system, lineLimit: 2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func episodeRow(_ episode: Episode) -> some View {
        NavigationLink(value: episode) {
            // Centred, not top-aligned: the chip and the menu are single
            // objects beside a title that can run to three lines, and pinning
            // them to the top leaves them stranded above it.
            HStack(alignment: .center, spacing: 10) {
                numberChip(for: episode)

                VStack(alignment: .leading, spacing: 3) {
                    Text(episode.title)
                        .font(Theme.semibold(14, relativeTo: .headline))
                        .foregroundStyle(episode.isPlayed || episode.isLocked ? Theme.muted : Theme.bone)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 7) {
                        PatreonMark(episode: episode)
                        Text(dateline(for: episode))
                            .font(Theme.body(11, relativeTo: .caption))
                            .monospacedDigit()
                            .foregroundStyle(Theme.muted)
                        DownloadIndicator(episode: episode)
                    }
                }

                Spacer(minLength: 4)
                EpisodeActionsMenu(episode: episode)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
    }

    /// The season and episode numbers, boxed — which frees the line below
    /// for the date and runtime alone.
    @ViewBuilder
    private func numberChip(for episode: Episode) -> some View {
        if let number = episode.number {
            // An invisible two-line template sets the height, and the real
            // numbers are centred over it.
            //
            // A show without seasons would otherwise get a chip a line shorter
            // than its neighbours', and a list of two box sizes reads as a
            // mistake — but reserving that line *inside* the stack is what
            // pushed a lone episode number to the bottom of its box instead of
            // the middle. Sizing from a template keeps both true at once, and
            // keeps working at any Dynamic Type size.
            VStack(spacing: 0) {
                // Both lines always, so the template is as tall as the tallest
                // chip; `chipTemplate.season` is nil only when no episode in
                // the show has one, and then no chip draws a season either.
                if let season = chipTemplate.season { Text(season) } else { Text(Copy.Episode.season(0)) }
                Text(chipTemplate.number)
            }
            .hidden()
            .overlay {
                VStack(spacing: 0) {
                    if let season = episode.season {
                        Text(Copy.Episode.season(season))
                    }
                    Text(Copy.Episode.number(number))
                }
            }
            .font(Theme.display(10, relativeTo: .caption2))
            .foregroundStyle(Theme.sky)
            // minWidth, not width: the template above is what the real numbers
            // are laid out inside — `.overlay` takes the size of the view it is
            // attached to, which is the *hidden* stack, long before this line
            // runs. A fixed 34 therefore padded the box out without giving the
            // numbers any more room, and "E10" wrapped to two lines inside a
            // chip that looked wide enough for it.
            .frame(minWidth: 34)
            .padding(.vertical, 4)
            .padding(.horizontal, 4)
            .background(Theme.sky.opacity(0.07), in: RoundedRectangle(cornerRadius: 5))
            .overlay {
                RoundedRectangle(cornerRadius: 5).strokeBorder(Theme.line, lineWidth: 1)
            }
            .accessibilityElement()
            .accessibilityLabel(
                episode.season.map { Copy.Episode.a11ySeasonEpisode($0, number: number) } ?? Copy.Episode.a11yEpisode(number)
            )
        } else {
            // Unnumbered episodes keep the rows aligned without drawing an
            // empty box — by laying out the very same invisible template,
            // rather than by a second copy of the width that would then have to
            // be kept in step with it by hand.
            VStack(spacing: 0) {
                if let season = chipTemplate.season { Text(season) } else { Text(Copy.Episode.season(0)) }
                Text(chipTemplate.number)
            }
            .hidden()
            .font(Theme.display(10, relativeTo: .caption2))
            .frame(minWidth: 34)
            .padding(.vertical, 4)
            .padding(.horizontal, 4)
        }
    }

    /// "14 Sep 2026 · 67 min" (skipping whatever is missing).
    private func dateline(for episode: Episode) -> String {
        var parts = [episode.listedAt.formatted(.dateTime.day().month(.abbreviated).year())]
        if !episode.durationText.isEmpty {
            parts.append(episode.durationText)
        }
        return parts.joined(separator: " · ")
    }
}

/// Beside an episode's date: a padlock when it can't be played here, and
/// Patreon's name when it only exists there but can — so an early release
/// reads as one rather than as an ordinary episode. Nothing at all for an
/// episode anyone can play, even one that plays Patreon's ad-free copy.
struct PatreonMark: View {
    let episode: Episode

    var body: some View {
        if episode.isLocked {
            Image(systemName: "lock.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .accessibilityLabel(Copy.Episode.a11yLocked)
        } else if episode.isPatreonExclusive {
            Text(Copy.Episode.patreonMark)
                .font(Theme.bold(9, relativeTo: .caption2))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Theme.sky)
        }
    }
}

#Preview {
    NavigationStack {
        ShowView(show: SampleData.firstShow)
    }
    .environment(PlayerModel())
    .modelContainer(SampleData.previewContainer)
}
