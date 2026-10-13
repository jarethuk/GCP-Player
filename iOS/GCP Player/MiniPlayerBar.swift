//
//  MiniPlayerBar.swift
//  GCP Player
//
//  The compact "now playing" bar pinned to the bottom of every screen.
//

import SwiftUI
import SwiftData

struct MiniPlayerBar: View {
    // Pulls the shared PlayerModel out of the environment.
    @Environment(PlayerModel.self) private var player

    // Episode artwork when it has its own, otherwise the show's.
    private var artworkUrl: String? {
        player.currentEpisode?.artworkUrl ?? player.currentEpisode?.show?.artworkUrl
    }

    /// 0...1, guarding against a duration that hasn't loaded yet.
    private var progress: CGFloat {
        guard player.duration > 0 else { return 0 }
        return min(max(player.currentTime / player.duration, 0), 1)
    }

    var body: some View {
        VStack(spacing: 0) {
            progressHairline
            content
        }
        // The system .bar material reads grey against the navy, so the bar
        // mixes its own: ink, thinned enough to show content scrolling under.
        .background(Theme.inkDeep.opacity(0.94))
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.line).frame(height: 1)
        }
    }

    private var progressHairline: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Theme.sky.opacity(0.16)
                Theme.accentGradient
                    .frame(width: geometry.size.width * progress)
            }
        }
        .frame(height: 2)
        .accessibilityHidden(true)
    }

    private var content: some View {
        HStack(spacing: 10) {
            ArtworkView(urlString: artworkUrl, size: 40)

            VStack(alignment: .leading, spacing: 1) {
                Text(player.currentEpisode?.title ?? Copy.Player.nothingPlaying)
                    .font(Theme.bold(13, relativeTo: .subheadline))
                    .foregroundStyle(Theme.bone)
                    .lineLimit(1)
                Text(player.currentEpisode?.show?.title ?? "")
                    .font(Theme.body(10.5, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            GradientPlayButton(isPlaying: player.isPlaying, size: 32) {
                player.togglePlayPause()
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
    }
}

#Preview {
    // Previews don't run the real app, so we build our own player
    // with an episode already playing.
    let player = PlayerModel()
    player.play(SampleData.firstEpisode)
    return MiniPlayerBar()
        .environment(player)
        .modelContainer(SampleData.previewContainer)
}
