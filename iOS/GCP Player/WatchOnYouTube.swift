//
//  WatchOnYouTube.swift
//  GCP Player
//
//  The episode's video version, where the network filmed one.
//

import SwiftUI
import SwiftData

/// A link out to YouTube's own app, deliberately rather than a player of ours.
///
/// YouTube's terms rule out downloading, separating the audio track from the
/// video, and background playback — which is to say all three of the things
/// this app exists to do. An embedded player would stop the moment the screen
/// locked, could never be held for a tunnel, and would never reach CarPlay; on
/// a three-hour actual-play episode that reads as a bug rather than a
/// limitation. Handing off costs one tap and gives the viewer
/// picture-in-picture, casting, their own history and their own subscription.
///
/// Roughly half the catalogue has one. Nothing before 2020 was filmed, and
/// Blood of the Wild and GCN News Minute never are — so every one of these
/// views renders nothing at all when the episode has no video, rather than
/// showing a button that would go nowhere.
extension Episode {
    /// nil when the feed mentioned no video, or gave something unusable.
    var videoLink: URL? {
        guard let videoUrl, let link = URL(string: videoUrl) else { return nil }
        return link
    }

    /// The video, starting where the listener has got to — the player's live
    /// position if this is the episode loaded, the saved one otherwise.
    ///
    /// Close rather than exact. A public episode's audio carries ads the
    /// video doesn't, so it runs ahead of the picture by however many have
    /// played; Patreon's ad-free copy lines up far better. Either way it lands
    /// the viewer near the right scene rather than at the table-talk before it.
    @MainActor
    var videoLinkAtListeningPosition: URL? {
        guard let videoLink else { return nil }
        let player = PlayerModel.shared
        let seconds = player.currentEpisode === self ? player.currentTime : positionSeconds
        return Self.youTubeLink(videoLink, startingAt: seconds)
    }

    /// `link` with YouTube's `t=` start time — replacing any the feed's link
    /// already carried, the network's own "watch from here" links included.
    /// The first few seconds aren't worth a jump, and a finished episode's
    /// position is 0, so both open at the start.
    nonisolated static func youTubeLink(_ link: URL, startingAt seconds: TimeInterval) -> URL {
        guard var components = URLComponents(url: link, resolvingAgainstBaseURL: false) else { return link }
        var query = (components.queryItems ?? []).filter { $0.name != "t" && $0.name != "start" }
        if seconds >= 5 {
            query.append(URLQueryItem(name: "t", value: String(Int(seconds))))
        }
        components.queryItems = query.isEmpty ? nil : query
        return components.url ?? link
    }
}

/// The outlined secondary style, the same one "Play Next Episode" wears: this
/// is an alternative to playing, not the thing the screen is for.
struct WatchOnYouTubeButton: View {
    let episode: Episode

    @Environment(\.openURL) private var openURL

    var body: some View {
        if episode.videoLink != nil {
            // A button rather than a Link: the start time is read at the tap,
            // not whenever the view last drew, which on the episode screen
            // could be minutes behind the player.
            Button {
                if let link = episode.videoLinkAtListeningPosition { openURL(link) }
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "play.rectangle.fill")
                    Text(Copy.Youtube.watch.uppercased())
                        .tracking(1.8)
                }
                .font(Theme.bold(10, relativeTo: .caption))
                .foregroundStyle(Theme.sky)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .overlay {
                    RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.line, lineWidth: 1)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Copy.Youtube.a11yWatch)
            .accessibilityHint(Copy.Youtube.a11yWatchHint)
        }
    }
}

/// The same destination as a menu row, for the "…" menu on a list row — so
/// reaching the video doesn't mean opening the episode first.
struct WatchOnYouTubeMenuItem: View {
    let episode: Episode

    @Environment(\.openURL) private var openURL

    var body: some View {
        if episode.videoLink != nil {
            Button {
                if let link = episode.videoLinkAtListeningPosition { openURL(link) }
            } label: {
                Label(Copy.Youtube.watch, systemImage: "play.rectangle.fill")
            }
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        WatchOnYouTubeButton(episode: SampleData.firstEpisode)
    }
    .padding()
    .background(Theme.ink)
    .modelContainer(SampleData.previewContainer)
}
