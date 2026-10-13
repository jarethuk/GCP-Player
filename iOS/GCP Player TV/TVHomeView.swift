//
//  TVHomeView.swift
//  GCP Player TV
//
//  What the TV opens on. The phone opens on a list of shows; the TV opens
//  on the answer to "what's next?", because that is the only question
//  anyone asks a television from the sofa.
//
//  Three rows. Continue is one wide hero: whatever has a saved position,
//  newest first, *whichever device saved it* — iCloud has already brought
//  the phone's place across, so walking in from the car and pressing select
//  once resumes it. Then My Shows, and then what has been published this
//  week. With nothing starred, My Shows gives way to every show, because an
//  empty row on a television is just a wide dark gap.
//

import SwiftUI
import SwiftData

struct TVHomeView: View {
    @Environment(PlayerModel.self) private var player
    @Environment(ShowsModel.self) private var model
    @Environment(\.presentNowPlaying) private var presentNowPlaying

    @Query(sort: [SortDescriptor(\Show.latestEpisodeAt, order: .reverse), SortDescriptor(\Show.title)])
    private var shows: [Show]

    /// Started and not finished, most recently touched first. The stamp is
    /// the one CloudSyncEngine settles disagreements with, so an episode
    /// last moved on the phone sorts by when the phone moved it.
    @Query(
        filter: #Predicate<Episode> { !$0.isPlayed && $0.positionSeconds > 5 },
        sort: [SortDescriptor(\Episode.stateUpdatedAt, order: .reverse)]
    )
    private var inProgress: [Episode]

    @Namespace private var focus

    private var starred: [Show] { shows.filter(\.isStarred) }
    private var newThisWeek: [Show] { shows.filter { $0.hasNewEpisode(unplayedCount: model.unplayed($0)) } }

    /// What the hero offers: the episode in the player if there is one, else
    /// the newest place anyone left off, else the next episode of the most
    /// recently published starred show.
    private var hero: (episode: Episode, isResume: Bool)? {
        if let current = player.currentEpisode, !current.isPlayed { return (current, true) }
        if let started = inProgress.first { return (started, true) }
        if let next = starred.lazy.compactMap(\.nextUnplayed).first { return (next, false) }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 64) {
                if let hero {
                    TVContinueHero(episode: hero.episode, isResume: hero.isResume) {
                        play(hero.episode)
                    }
                    .prefersDefaultFocus(in: focus)
                }

                if starred.isEmpty {
                    posterRow(Copy.Shows.allShows, shows: shows)
                } else {
                    posterRow(Copy.Shows.myShows, shows: starred)
                }

                if !newThisWeek.isEmpty {
                    posterRow(Copy.Tv.newThisWeek, shows: newThisWeek)
                }
            }
            .padding(.bottom, 60)
        }
        .focusScope(focus)
        .scrollClipDisabled()
        .overlay {
            if shows.isEmpty { TVLoadingState() }
        }
    }

    private func play(_ episode: Episode) {
        if player.currentEpisode == episode {
            if !player.isPlaying { player.resume() }
        } else {
            player.play(episode)
        }
        // From Home, playing is the point — so the player comes forward.
        presentNowPlaying()
    }

    private func posterRow(_ title: String, shows: [Show]) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            Text(title)
                .font(Theme.bold(TVTheme.rowHeading, relativeTo: .title3))
                .foregroundStyle(Theme.bone)

            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: TVTheme.posterSpacing) {
                    ForEach(shows) { show in
                        TVPosterTile(show: show, unplayedCount: model.unplayed(show), value: show)
                    }
                }
                // Room for the focused tile to grow without being clipped.
                .padding(.vertical, 24)
            }
            .scrollClipDisabled()
            .scrollIndicators(.hidden)
        }
    }
}

/// The wide card at the top of Home: the show's artwork behind an ink scrim,
/// what you were listening to, how far through, and one button.
private struct TVContinueHero: View {
    let episode: Episode
    let isResume: Bool
    let action: () -> Void

    private var progress: Double {
        guard let total = episode.durationSeconds, total > 0 else { return 0 }
        return min(1, episode.positionSeconds / Double(total))
    }

    private var remainingText: String? {
        guard let total = episode.durationSeconds, episode.positionSeconds > 0 else { return nil }
        let minutes = max(1, Int((Double(total) - episode.positionSeconds) / 60))
        return Copy.Episode.minutesLeft(minutes)
    }

    private var numbering: String {
        [episode.season.map { Copy.Episode.season($0) }, episode.number.map { Copy.Episode.number($0) }]
            .compactMap { $0 }
            .joined(separator: " ")
    }

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 18) {
                TVMetaLabel(text: isResume ? Copy.Player.`continue` : Copy.Player.upNext, color: Theme.sky)

                Text(episode.show?.title ?? "")
                    .font(Theme.display(64, relativeTo: .largeTitle))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)

                Text(numbering.isEmpty ? episode.title : "\(numbering) · \(episode.title)")
                    .font(Theme.semibold(TVTheme.body, relativeTo: .headline))
                    .foregroundStyle(Theme.bone)
                    .lineLimit(1)

                if let remainingText {
                    HStack(spacing: 20) {
                        ProgressBar(fraction: progress)
                            .frame(width: 480, height: 8)
                        Text(remainingText)
                            .font(Theme.body(TVTheme.caption, relativeTo: .caption))
                            .foregroundStyle(Theme.muted)
                    }
                }

                Button(action: action) {
                    Label(isResume ? Copy.Tv.resume : Copy.Episode.play, systemImage: "play.fill")
                }
                .buttonStyle(TVPillButtonStyle())
                .padding(.top, 8)
            }
            .frame(maxWidth: 1000, alignment: .leading)
            Spacer(minLength: 0)
        }
        .padding(56)
        .frame(maxWidth: .infinity, minHeight: 460, alignment: .bottomLeading)
        .background {
            WideArtworkView(urlString: episode.artworkUrl ?? episode.show?.artworkUrl, renderSize: 1280)
                .overlay {
                    LinearGradient(
                        colors: [Theme.inkDeep.opacity(0.95), Theme.inkDeep.opacity(0.6), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay {
            RoundedRectangle(cornerRadius: 24).strokeBorder(Theme.line, lineWidth: 1)
        }
    }
}

/// A thin capsule filled to a fraction, in sky on a faint bone track.
struct ProgressBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.bone.opacity(0.2))
                Capsule()
                    .fill(Theme.sky)
                    .frame(width: max(0, min(1, fraction)) * geometry.size.width)
            }
        }
    }
}

/// What a screen shows while the first sync is still bringing shows in.
struct TVLoadingState: View {
    @Environment(ShowsModel.self) private var model

    var body: some View {
        if let syncError = model.syncError, !model.isSyncing {
            ContentUnavailableView {
                Label(Copy.Shows.loadFailed, systemImage: "wifi.slash")
                    .foregroundStyle(Theme.bone)
            } description: {
                Text(syncError).foregroundStyle(Theme.muted)
            }
        } else {
            VStack(spacing: 24) {
                ProgressView().tint(Theme.sky)
                TVMetaLabel(text: Copy.Shows.loading, showsTick: false)
            }
        }
    }
}
