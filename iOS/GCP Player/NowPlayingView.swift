//
//  NowPlayingView.swift
//  GCP Player
//
//  The full-screen player, presented when the mini player bar is tapped.
//

import SwiftUI
import SwiftData

struct NowPlayingView: View {
    @Environment(PlayerModel.self) private var player

    /// Hands the show back to the navigation stack underneath. Defaults to
    /// doing nothing so previews can build the view on its own.
    var onGoToShow: (Show) -> Void = { _ in }

    // While the user is dragging the slider we show *their* position, not
    // the player's — otherwise the twice-a-second time updates would yank
    // the thumb out of their finger. nil = not scrubbing.
    @State private var scrubTime: Double?

    private var artworkUrl: String? {
        player.currentEpisode?.artworkUrl ?? player.currentEpisode?.show?.artworkUrl
    }

    private var displayTime: Double {
        scrubTime ?? player.currentTime
    }

    var body: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 0)

            ArtworkView(urlString: artworkUrl, size: 250)
                .shadow(color: .black.opacity(0.55), radius: 22, y: 14)

            VStack(spacing: 6) {
                Text(player.currentEpisode?.title ?? Copy.Player.nothingPlaying)
                    .font(Theme.display(21, relativeTo: .title2))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.bone)
                    .multilineTextAlignment(.center)
                if let show = player.currentEpisode?.show {
                    Button {
                        onGoToShow(show)
                    } label: {
                        HStack(spacing: 5) {
                            MetaLabel(text: show.title, showsTick: false, color: Theme.sky)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(Theme.sky)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Copy.Player.a11yGoToShow(show.title))
                    .accessibilityAddTraits(.isButton)
                } else {
                    MetaLabel(text: "", showsTick: false)
                }

                if let position = player.positionInShow {
                    MetaLabel(
                        text: Copy.Player.positionInShow(position.index, total: position.total),
                        showsTick: false
                    )
                    .accessibilityLabel(
                        Copy.Player.a11yPositionInShow(position.index, total: position.total)
                    )
                    .padding(.top, 2)
                }
            }

            VStack(spacing: 4) {
                Slider(
                    value: Binding(
                        get: { displayTime },
                        set: { scrubTime = $0 }
                    ),
                    in: 0...max(player.duration, 1),
                    onEditingChanged: { editing in
                        // Seek once, when the finger lifts.
                        if !editing, let scrubTime {
                            player.seek(to: scrubTime)
                            self.scrubTime = nil
                        }
                    }
                )
                .tint(Theme.sky)
                HStack {
                    Text(timeText(displayTime))
                    Spacer()
                    Text("−" + timeText(max(0, player.duration - displayTime)))
                }
                // Tabular figures so the numbers stop twitching as they
                // count. Open Sans has no tabular set reachable from here,
                // so the counters — and only the counters — use the system
                // face, which does.
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.muted)
            }

            // The gradient lands here and nowhere else on the screen: it
            // marks the thing that plays.
            HStack(spacing: 30) {
                SkipButton(seconds: 15, systemImage: "gobackward.15") {
                    player.skip(by: -15)
                }

                GradientPlayButton(isPlaying: player.isPlaying) {
                    player.togglePlayPause()
                }

                SkipButton(seconds: 30, systemImage: "goforward.30") {
                    player.skip(by: 30)
                }
            }

            VStack(spacing: 12) {
                // Marks the current episode played and starts the show's next.
                Button {
                    player.playNext()
                } label: {
                    Text(Copy.Player.playNextEpisode.uppercased())
                        .font(Theme.bold(10, relativeTo: .caption))
                        .tracking(1.8)
                        .foregroundStyle(player.nextEpisode == nil ? Theme.muted.opacity(0.5) : Theme.sky)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .overlay {
                            RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.line, lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
                .disabled(player.nextEpisode == nil)

                // Leaving for YouTube stops this player: the two cannot both
                // hold the audio session, and YouTube's terms put background
                // playback out of reach anyway. Better to hand over cleanly
                // than to have two things fighting over the sound.
                if let episode = player.currentEpisode {
                    WatchOnYouTubeButton(episode: episode)
                }

                // Down here on its own line: beside the "x of y" counter it
                // read as a count of episodes being downloaded.
                if let episode = player.currentEpisode {
                    DownloadIndicator(episode: episode, showsLabel: true)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 26)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .networkBackground()
    }

    /// 754 seconds → "12:34"; over an hour → "1:02:04".
    private func timeText(_ seconds: Double) -> String {
        let pattern: Duration.TimeFormatStyle.Pattern =
            player.duration >= 3600 ? .hourMinuteSecond : .minuteSecond
        return Duration.seconds(seconds).formatted(.time(pattern: pattern))
    }
}

#Preview {
    let player = PlayerModel()
    player.play(SampleData.firstEpisode)
    return NowPlayingView()
        .environment(player)
        .modelContainer(SampleData.previewContainer)
}
