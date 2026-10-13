//
//  TVNowPlayingView.swift
//  GCP Player TV
//
//  The screen people will see most, and mostly without touching the remote
//  — so its resting state is the one that is designed.
//
//  Active: artwork on the left, what is playing and how far through on the
//  right, and what comes next. After ten seconds without input the words
//  fade, the artwork grows, and it starts to drift, about forty points a
//  minute. That keeps an hour of the same picture from burning into an OLED
//  panel, and it makes the screen something you can leave on.
//
//  There are no transport buttons. The remote is the transport: its
//  play/pause button, a click on either edge of the clickpad to skip 15 back
//  or 30 forward — the same intervals the lock screen and CarPlay use — and
//  select to play or pause. Buttons would need focus, and focus is what the
//  left and right clicks would otherwise be spent moving.
//

import SwiftUI
import SwiftData

struct TVNowPlayingView: View {
    @Environment(PlayerModel.self) private var player
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var lastInteraction = Date.now
    @State private var isIdle = false
    @State private var isDrifting = false
    @FocusState private var isFocused: Bool

    private static let idleAfter: Duration = .seconds(10)

    private var episode: Episode? { player.currentEpisode }
    private var artworkUrl: String? { episode?.artworkUrl ?? episode?.show?.artworkUrl }

    var body: some View {
        ZStack {
            // The artwork again, blurred to a wash behind everything, so the
            // screen takes the colour of the show rather than a flat navy.
            WideArtworkView(urlString: artworkUrl, renderSize: 400)
                .blur(radius: 80)
                .opacity(0.35)
                .ignoresSafeArea()

            HStack(spacing: 80) {
                ArtworkView(urlString: artworkUrl, size: 600)
                    .shadow(color: .black.opacity(0.55), radius: 40, y: 24)
                    .scaleEffect(isIdle ? 1.12 : 1)
                    .offset(drift)

                details
                    .opacity(isIdle ? 0 : 1)
            }
            .padding(.horizontal, 40)

            // What survives idling: a hairline of progress along the bottom.
            VStack {
                Spacer()
                ProgressBar(fraction: player.duration > 0 ? player.currentTime / player.duration : 0)
                    .frame(height: 4)
                    .opacity(isIdle ? 0.7 : 0)
            }
            .ignoresSafeArea()
        }
        .animation(.easeInOut(duration: 1.2), value: isIdle)
        .focusable()
        .focused($isFocused)
        .onAppear { isFocused = true }
        .onMoveCommand { direction in
            switch direction {
            case .left: player.skip(by: -15)
            case .right: player.skip(by: 30)
            default: break
            }
            wake()
        }
        .onTapGesture {
            // Select, on a focused view. The same as the play/pause button:
            // the only other thing select could mean here is "show the
            // controls", and waking does that already.
            player.togglePlayPause()
            wake()
        }
        .contextMenu {
            if let next = player.nextEpisode {
                Button {
                    player.playNext()
                } label: {
                    Label(Copy.Tv.playNextNamed(next.title), systemImage: "forward.end.fill")
                }
            }
            if let episode {
                Button {
                    episode.markPlayed()
                } label: {
                    Label(Copy.Actions.markPlayed, systemImage: "checkmark.circle")
                }
            }
        }
        .onChange(of: player.isPlaying) { wake() }
        .task(id: lastInteraction) {
            // Restarted by every interaction; only a full ten seconds of
            // quiet gets through to idling.
            try? await Task.sleep(for: Self.idleAfter)
            guard !Task.isCancelled else { return }
            isIdle = true
            startDrifting()
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 24) {
            if let show = episode?.show {
                TVMetaLabel(text: positionText.map { "\(show.title) · \($0)" } ?? show.title, color: Theme.sky)
            }

            Text(episode?.title ?? Copy.Player.nothingPlaying)
                .font(Theme.display(TVTheme.screenTitle, relativeTo: .largeTitle))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
                .lineLimit(3)
                .minimumScaleFactor(0.7)

            VStack(spacing: 12) {
                ProgressBar(fraction: player.duration > 0 ? player.currentTime / player.duration : 0)
                    .frame(height: 8)
                HStack {
                    Text(Self.clock(player.currentTime))
                    Spacer()
                    Text("−" + Self.clock(max(0, player.duration - player.currentTime)))
                }
                .font(Theme.semibold(TVTheme.caption, relativeTo: .caption).monospacedDigit())
                .foregroundStyle(Theme.muted)
            }
            .padding(.top, 12)

            HStack(spacing: 18) {
                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                Text(Copy.Tv.remoteHint)
            }
            .font(Theme.body(TVTheme.meta, relativeTo: .caption))
            .foregroundStyle(Theme.muted)

            if let next = player.nextEpisode {
                Divider().overlay(Theme.line)
                Text(Copy.Tv.upNextEpisode("\(next.tvNumbering) \(next.title)"))
                    .font(Theme.body(TVTheme.caption, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: 900, alignment: .leading)
    }

    private var positionText: String? {
        player.positionInShow.map { Copy.Player.positionInShow($0.index, total: $0.total) }
    }

    // MARK: - Idling

    private var drift: CGSize {
        guard isIdle, !reduceMotion else { return .zero }
        return isDrifting ? CGSize(width: 40, height: -24) : CGSize(width: -40, height: 24)
    }

    private func startDrifting() {
        // Reduce Motion: the artwork grows and stays put.
        guard !reduceMotion else { return }
        withAnimation(.linear(duration: 120).repeatForever(autoreverses: true)) {
            isDrifting.toggle()
        }
    }

    private func wake() {
        lastInteraction = .now
        guard isIdle else { return }
        // Cancels the repeating drift by animating to a fixed value.
        withAnimation(.easeOut(duration: 0.6)) {
            isIdle = false
            isDrifting = false
        }
    }

    private static func clock(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite else { return "0:00" }
        let total = Int(seconds)
        let (h, m, s) = (total / 3600, total / 60 % 60, total % 60)
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}
