//
//  EpisodeView.swift
//  GCP Player
//
//  Details for a single episode.
//
//  One column on a phone. Two where there is room: the cover and the
//  controls in a rail on the left, the description beside it — a single
//  column stretched to seven hundred points is the most obviously-a-phone
//  screen in the app.
//

import SwiftUI
import SwiftData

struct EpisodeView: View {
    @Environment(PlayerModel.self) private var player
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    let episode: Episode

    /// Width the content has to work with — the size class alone says
    /// "regular" for the detail column of a portrait iPad, which leaves the
    /// description squeezed into a strip beside the rail.
    @State private var contentWidth: CGFloat = 0

    private var isRegular: Bool { horizontalSizeClass == .regular }

    /// Room for the rail and a readable column of text beside it.
    private var fitsSideBySide: Bool { contentWidth >= 640 }

    /// The wide layout's rail centred above the text, not beside it.
    private var isStacked: Bool { isRegular && !fitsSideBySide }

    // Is *this* episode the one loaded in the player?
    private var isCurrentEpisode: Bool {
        player.currentEpisode == episode
    }

    var body: some View {
        ScrollView {
            Group {
                if isRegular {
                    wideLayout
                } else {
                    narrowLayout
                }
            }
            // Wide enough for a rail and a readable paragraph beside it,
            // and no wider: past this the description stops being a
            // column of text and becomes a line of it.
            .frame(maxWidth: isRegular ? 900 : .infinity)
            .frame(maxWidth: .infinity)
            .padding()
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { contentWidth = $0 }
        }
        .background(Theme.ink.ignoresSafeArea())
        .scrollIndicators(.hidden)
        .navigationTitle(Copy.Episode.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem {
                EpisodeActionsMenu(episode: episode)
                    .foregroundStyle(Theme.bone)
            }
        }
    }

    private var narrowLayout: some View {
        VStack(alignment: .leading, spacing: 16) {
            artwork(size: 200)
            titleBlock
            playButton
            // Renders nothing when the network never filmed this one.
            WatchOnYouTubeButton(episode: episode)
            descriptionText
        }
    }

    @ViewBuilder
    private var wideLayout: some View {
        if fitsSideBySide {
            HStack(alignment: .top, spacing: 30) {
                rail
                textColumn
            }
        } else {
            // Too narrow for two columns (a portrait iPad's detail pane):
            // the title and description run under the rail instead.
            VStack(alignment: .leading, spacing: 24) {
                rail
                    .frame(maxWidth: .infinity)
                textColumn
            }
        }
    }

    private var rail: some View {
        VStack(spacing: 14) {
            artwork(size: 280)
            playButton
            WatchOnYouTubeButton(episode: episode)
        }
        .frame(width: 280)
    }

    private var textColumn: some View {
        VStack(alignment: .leading, spacing: 14) {
            titleBlock
            descriptionText
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func artwork(size: CGFloat) -> some View {
        ArtworkView(urlString: episode.artworkUrl ?? episode.show?.artworkUrl, size: size)
            .frame(maxWidth: .infinity)
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(episode.title)
                .font(Theme.display(22, relativeTo: .title2))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
                .multilineTextAlignment(.leading)
            HStack(spacing: 10) {
                MetaLabel(text: "\(episode.show?.title ?? Copy.Episode.unknownShow) · \(episode.durationText)", lineLimit: 2)
                PatreonMark(episode: episode)
                DownloadIndicator(episode: episode)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var playButton: some View {
        if episode.isLocked {
            lockedNotice
        } else {
            VStack(alignment: .leading, spacing: 8) {
                unlockedPlayButton
                if isCurrentEpisode, let error = player.playbackError {
                    Text(error)
                        .font(Theme.body(12, relativeTo: .footnote))
                        .foregroundStyle(Theme.ember)
                }
            }
        }
    }

    /// In place of Play, for an episode only Patreon has and this device
    /// can't reach: what it is, and where to go to fix that.
    private var lockedNotice: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill")
                Text(Copy.Episode.lockedTitle.uppercased())
                    .tracking(1.8)
            }
            .font(Theme.bold(11, relativeTo: .headline))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .overlay {
                RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.line, lineWidth: 1)
            }

            Text(episode.show?.isPublic == false
                 ? Copy.Episode.lockedPatreonOnlyShow
                 : Copy.Episode.lockedEarlyRelease)
                .font(Theme.body(12, relativeTo: .footnote))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(isStacked ? .center : .leading)
                .frame(maxWidth: .infinity, alignment: isStacked ? .center : .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var unlockedPlayButton: some View {
        Button {
            if isCurrentEpisode {
                player.togglePlayPause()
            } else {
                player.play(episode)
            }
        } label: {
            let isPlayingThis = isCurrentEpisode && player.isPlaying
            let isPreparingThis = isCurrentEpisode && player.isPreparing
            HStack(spacing: 8) {
                if isPreparingThis {
                    // Asking Patreon for the audio.
                    ProgressView().tint(Theme.inkDeep).controlSize(.small)
                } else {
                    Image(systemName: isPlayingThis ? "pause.fill" : "play.fill")
                }
                Text((isPreparingThis ? Copy.Episode.loading : isPlayingThis ? Copy.Episode.pause : Copy.Episode.play).uppercased())
                    .tracking(1.8)
            }
            .font(Theme.bold(11, relativeTo: .headline))
            .foregroundStyle(Theme.inkDeep)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
    }

    @ViewBuilder
    private var descriptionText: some View {
        if let description = episode.plainDescription {
            Text(description)
                .font(Theme.body(14))
                .foregroundStyle(Theme.muted)
                .lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview {
    NavigationStack {
        EpisodeView(episode: SampleData.firstEpisode)
    }
    .environment(PlayerModel())
    .modelContainer(SampleData.previewContainer)
}
