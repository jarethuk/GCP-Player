//
//  TVShowView.swift
//  GCP Player TV
//
//  One show: its artwork across the top half behind an ink scrim, the one
//  button that matters, and the episodes in listening order below.
//
//  Playing from this list keeps you here rather than sending you to the
//  player. On a show screen the next thing you want is usually another
//  episode from the same list, and a full-screen player would cost a Back
//  press every time. Home is different — resuming is the whole point there.
//
//  The phone's episode screen has no TV equivalent. What it held — the
//  description, mark as played, Watch on YouTube — is a long-press on the
//  row, so the list is never more than one level deep.
//

import SwiftUI
import SwiftData

struct TVShowView: View {
    @Environment(PlayerModel.self) private var player

    let show: Show

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
    @State private var describedEpisode: Episode?
    @Namespace private var focus

    // Oldest first — the order you'd listen to a campaign in.
    private var episodes: [Episode] {
        show.episodes
            .filter { (filter == .played) == $0.isPlayed }
            .sorted { $0.listedAt < $1.listedAt }
    }

    private var metaText: String {
        let count = Copy.Show.episodeCount(show.episodes.count)
        return [show.system, count].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 48) {
                hero

                Picker(Copy.Tv.a11yEpisodeFilter, selection: $filter) {
                    ForEach(PlayedFilter.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: 560)

                LazyVStack(spacing: 18) {
                    ForEach(episodes) { episode in
                        TVEpisodeRow(episode: episode) { describedEpisode = episode }
                    }
                }

                if episodes.isEmpty {
                    Text(filter == .unplayed ? Copy.Show.allCaughtUp : Copy.Show.nothingPlayed)
                        .font(Theme.body(TVTheme.body, relativeTo: .body))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.bottom, 60)
        }
        .focusScope(focus)
        .scrollClipDisabled()
        .background(alignment: .top) {
            // Past the safe area on purpose: artwork is the one thing allowed
            // to run to the edges of the screen.
            WideArtworkView(urlString: show.artworkUrl, renderSize: 1280)
                .frame(height: 720)
                .overlay {
                    LinearGradient(
                        colors: [Theme.ink.opacity(0.97), Theme.ink.opacity(0.7), Theme.ink.opacity(0.15)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                }
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [.clear, Theme.ink], startPoint: .top, endPoint: .bottom)
                        .frame(height: 280)
                }
                .clipped()
                .ignoresSafeArea()
        }
        .networkBackground()
        .sheet(item: $describedEpisode) { episode in
            TVEpisodeDetails(episode: episode)
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 22) {
            TVMetaLabel(text: metaText, color: Theme.sky)

            Text(show.title)
                .font(Theme.display(TVTheme.heroTitle, relativeTo: .largeTitle))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: 1200, alignment: .leading)

            HStack(spacing: 28) {
                if let next = show.nextUnplayed {
                    Button {
                        player.currentEpisode == next ? player.resume() : player.play(next)
                    } label: {
                        Label(next.positionSeconds > 5 ? Copy.Show.resumeNextUnplayed : Copy.Show.playNextUnplayed,
                              systemImage: "play.fill")
                    }
                    .buttonStyle(TVPillButtonStyle())
                    .prefersDefaultFocus(in: focus)
                }

                Button {
                    show.setStarred(!show.isStarred)
                } label: {
                    Label(show.isStarred ? Copy.Show.inMyShows : Copy.Show.addToMyShows,
                          systemImage: show.isStarred ? "star.fill" : "star")
                }
                .buttonStyle(TVPillButtonStyle(isPrimary: false))
            }
            .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, minHeight: 440, alignment: .bottomLeading)
    }
}

/// One episode: its numbering chip, title, date and length, and a progress
/// line once started. Select plays it; a long press holds everything else.
private struct TVEpisodeRow: View {
    @Environment(PlayerModel.self) private var player

    let episode: Episode
    let showDetails: () -> Void

    private var isCurrent: Bool { player.currentEpisode == episode }

    private var progress: Double? {
        guard episode.positionSeconds > 5, let total = episode.durationSeconds, total > 0 else { return nil }
        return episode.positionSeconds / Double(total)
    }

    var body: some View {
        Button {
            isCurrent ? player.togglePlayPause() : player.play(episode)
        } label: {
            HStack(spacing: 32) {
                Text(episode.tvNumbering)
                    .font(Theme.bold(TVTheme.meta, relativeTo: .caption))
                    .tracking(2)
                    .foregroundStyle(Theme.sky)
                    .frame(width: 120, height: 64)
                    .background(Theme.inkDeep.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.line, lineWidth: 1) }

                VStack(alignment: .leading, spacing: 8) {
                    Text(episode.title)
                        .font(Theme.semibold(TVTheme.body, relativeTo: .headline))
                        .foregroundStyle(Theme.bone)
                        .lineLimit(1)
                    HStack(spacing: 16) {
                        Text([episode.listedAt.formatted(.dateTime.day().month(.abbreviated).year()),
                              episode.durationText]
                            .filter { !$0.isEmpty }
                            .joined(separator: " · "))
                            .font(Theme.body(TVTheme.caption, relativeTo: .caption))
                            .foregroundStyle(Theme.muted)
                        if let progress {
                            ProgressBar(fraction: progress)
                                .frame(width: 220, height: 6)
                        }
                    }
                }

                Spacer(minLength: 0)

                if isCurrent {
                    Image(systemName: player.isPlaying ? "speaker.wave.2.fill" : "pause.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(Theme.sky)
                        .accessibilityLabel(player.isPlaying ? Copy.Player.playing : Copy.Player.paused)
                }
            }
        }
        .buttonStyle(TVRowButtonStyle())
        .contextMenu {
            Button { showDetails() } label: {
                Label(Copy.Episode.about, systemImage: "text.alignleft")
            }
            WatchOnYouTubeMenuItem(episode: episode)
            Button {
                episode.markPlayed(!episode.isPlayed)
            } label: {
                Label(episode.isPlayed ? Copy.Actions.markUnplayed : Copy.Actions.markPlayed,
                      systemImage: episode.isPlayed ? "circle" : "checkmark.circle")
            }
            Button {
                episode.markAllPreviousPlayed()
            } label: {
                Label(Copy.Actions.markPreviousPlayed, systemImage: "text.badge.checkmark")
            }
        }
    }
}

/// The description, which is the one thing the phone's episode screen had
/// that a row can't carry.
private struct TVEpisodeDetails: View {
    let episode: Episode

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                TVMetaLabel(text: [episode.show?.title, episode.tvNumbering].compactMap { $0 }.joined(separator: " · "),
                            color: Theme.sky)
                Text(episode.title)
                    .font(Theme.display(TVTheme.screenTitle, relativeTo: .largeTitle))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)
                Text(episode.plainDescription ?? Copy.Episode.noDescription)
                    .font(Theme.body(TVTheme.body, relativeTo: .body))
                    .foregroundStyle(Theme.bone.opacity(0.85))
                    .lineSpacing(8)
                    .frame(maxWidth: 1200, alignment: .leading)
                    // Focusable so a long description can be scrolled with
                    // the remote; text alone can't take focus.
                    .focusable()
            }
            .padding(60)
        }
        .networkBackground()
    }
}

extension Episode {
    /// "S1 E38", "E155", or nothing the feed gave us — the numbering chip.
    var tvNumbering: String {
        let parts = [season.map { Copy.Episode.season($0) }, number.map { Copy.Episode.number($0) }].compactMap { $0 }
        return parts.isEmpty ? "—" : parts.joined(separator: " ")
    }
}
