//
//  PlayerModel.swift
//  GCP Player
//
//  The single source of truth for playback state, backed by AVPlayer.
//  Also publishes state to the system (lock screen, control centre,
//  CarPlay's now-playing screen) and handles remote commands from them.
//

import Foundation
import AVFoundation
import MediaPlayer
import SwiftData
import UIKit

@Observable
final class PlayerModel {
    // One instance for the whole process: the phone UI (via .environment)
    // and the CarPlay scene both drive this same player.
    static let shared = PlayerModel()

    private(set) var currentEpisode: Episode?
    private(set) var isPlaying = false

    /// Playback position and length in seconds, refreshed twice a second
    /// while something is loaded.
    private(set) var currentTime: TimeInterval = 0
    private(set) var duration: TimeInterval = 0

    /// True while the audio is being looked up before it can start — a
    /// Patreon episode's URL comes from the patron's feed, a round trip away.
    private(set) var isPreparing = false

    /// Why the last play didn't start, for the screen to say. Cleared by the
    /// next one.
    private(set) var playbackError: String?

    /// The play waiting on Patreon, so starting something else cancels it
    /// rather than racing it.
    private var preparation: Task<Void, Never>?

    private let avPlayer = AVPlayer()
    private var lockScreenArtwork: MPMediaItemArtwork?
    private var artworkTask: Task<Void, Never>?

    /// Where the guid of the last-played episode is remembered between
    /// launches, so the mini player can come back on the next start.
    private static let lastEpisodeKey = "lastPlayedEpisodeGuid"

    /// False for an episode that has only been *restored* — shown in the
    /// mini player, but with no audio handed to AVPlayer yet. We don't
    /// buffer a download at launch for something the user may never press
    /// play on.
    private var isAudioLoaded: Bool { avPlayer.currentItem != nil }

    init() {
        setUpRemoteCommands()
        startTimePolling()
    }

    // MARK: - Controls

    func play(_ episode: Episode) {
        // Padlocked: Patreon's alone, and no token to reach it with. The
        // screens don't offer play for these, but the car and a keyboard
        // shortcut can still ask.
        guard !episode.isLocked else {
            playbackError = PatreonError.noToken.errorDescription
            return
        }
        preparation?.cancel()
        playbackError = nil

        // Downloaded wins over streaming: instant, and it works with no
        // signal. A download that lands mid-stream isn't swapped in — that
        // would interrupt playback — so it takes effect next time.
        if let localURL = DownloadManager.shared.localURL(for: episode) {
            print("[player] playing offline copy of \(episode.title)")
            start(episode, from: localURL)
            return
        }

        guard episode.playsFromPatreon else {
            guard let url = episode.audioUrl.flatMap(URL.init(string:)) else { return }
            print("[player] streaming \(episode.title)")
            start(episode, from: url)
            return
        }

        // Patreon: the URL — and the runtime, which differs from the public
        // one by the ads it hasn't got — come from the patron's feed. The
        // episode goes into the player now, so the tap visibly did something.
        // Whatever was playing stops now, not when Patreon answers.
        avPlayer.replaceCurrentItem(with: nil)
        currentEpisode = episode
        isPreparing = true
        isPlaying = true
        duration = TimeInterval(episode.effectiveDurationSeconds ?? 0)
        currentTime = episode.positionSeconds
        updateNowPlayingInfo()

        preparation = Task { @MainActor [weak self] in
            let url: URL
            do {
                let audio = try await PatreonFeeds.shared.audio(for: episode)
                url = audio.url
                print("[player] streaming \(episode.title) from Patreon")
            } catch {
                guard !Task.isCancelled else { return }
                // An early release has nothing else to fall back on; a public
                // episode still has its public copy, ads and all.
                guard let fallback = episode.audioUrl.flatMap(URL.init(string:)) else {
                    self?.isPreparing = false
                    self?.isPlaying = false
                    self?.playbackError = error.localizedDescription
                    return
                }
                print("[player] Patreon failed (\(error.localizedDescription)); streaming the public copy")
                url = fallback
            }
            guard !Task.isCancelled, let self, self.currentEpisode === episode else { return }
            self.isPreparing = false
            self.start(episode, from: url)
        }
    }

    /// Hands a resolved URL to AVPlayer and does everything that goes with
    /// starting an episode.
    private func start(_ episode: Episode, from url: URL) {
        isPreparing = false

        // .playback = real media audio: plays with the silent switch on,
        // and (with the background-audio capability) with the screen locked.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)

        avPlayer.replaceCurrentItem(with: AVPlayerItem(url: url))

        // Resume where this episode was left off (unless it's effectively
        // at the start anyway).
        if episode.positionSeconds > 5 {
            avPlayer.seek(to: CMTime(seconds: episode.positionSeconds, preferredTimescale: 600))
            currentTime = episode.positionSeconds
        } else {
            currentTime = 0
        }
        avPlayer.play()

        currentEpisode = episode
        isPlaying = true
        // The feed's duration until AVPlayer learns the real one from the file
        // — Patreon's, if that's the copy playing.
        duration = TimeInterval(episode.effectiveDurationSeconds ?? 0)

        UserDefaults.standard.set(episode.guid, forKey: Self.lastEpisodeKey)

        // Starting something from a show is how a show joins My Shows: the
        // listening says it, so the user doesn't have to. Checked first so a
        // replay of an already-starred show isn't a write on every play.
        if let show = episode.show, !show.isStarred {
            show.setStarred(true)
        }

        // Keep this one for offline, and get the next one ready before the
        // listener arrives at it — both switchable in Settings.
        if Settings.downloadsCurrentEpisode {
            DownloadManager.shared.downloadIfNeeded(episode)
        }
        if Settings.downloadsNextEpisode, let next = nextEpisode {
            DownloadManager.shared.downloadIfNeeded(next)
        }

        loadLockScreenArtwork(for: episode)
        updateNowPlayingInfo()
    }

    func pause() {
        guard let currentEpisode else { return }
        // Still waiting on Patreon: pausing means not starting.
        if isPreparing {
            preparation?.cancel()
            isPreparing = false
            isPlaying = false
            updateNowPlayingInfo()
            return
        }
        avPlayer.pause()
        isPlaying = false
        // A pause is the likeliest moment for someone to pick up the other
        // device, so this position goes to iCloud now rather than waiting
        // for the next window.
        currentEpisode.updatePosition(currentTime, flush: true)
        updateNowPlayingInfo()
    }

    func resume() {
        guard let currentEpisode else { return }
        // A restored episode has no audio loaded yet — start it properly,
        // which picks up its saved position.
        guard isAudioLoaded else {
            play(currentEpisode)
            return
        }
        avPlayer.play()
        isPlaying = true
        updateNowPlayingInfo()
    }

    func togglePlayPause() {
        isPlaying ? pause() : resume()
    }

    func seek(to seconds: TimeInterval) {
        guard currentEpisode != nil else { return }
        let clamped = max(0, duration > 0 ? min(seconds, duration) : seconds)
        if isAudioLoaded {
            avPlayer.seek(to: CMTime(seconds: clamped, preferredTimescale: 600))
        }
        currentTime = clamped
        // Deliberate: a scrub or a skip is a place the listener chose.
        currentEpisode?.updatePosition(clamped, flush: true)
        updateNowPlayingInfo()
    }

    /// Skip forward (positive) or back (negative) by a number of seconds.
    func skip(by seconds: TimeInterval) {
        seek(to: currentTime + seconds)
    }

    /// Stops playback and forgets what was playing.
    ///
    /// Called before the local database is wiped: `currentEpisode` would
    /// otherwise be left pointing at a deleted row, and reading a deleted
    /// SwiftData object traps rather than returning nil.
    func stop() {
        preparation?.cancel()
        isPreparing = false
        artworkTask?.cancel()
        avPlayer.pause()
        avPlayer.replaceCurrentItem(with: nil)
        isPlaying = false
        currentEpisode = nil
        currentTime = 0
        duration = 0
        lockScreenArtwork = nil
        UserDefaults.standard.removeObject(forKey: Self.lastEpisodeKey)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    /// Puts the current position beyond doubt, and offers it to the
    /// other devices immediately.
    ///
    /// Called as the app goes to the background — the moment before someone
    /// picks up the iPad, and one the player would otherwise sail past:
    /// nothing else writes a position unless playback actually stops.
    @MainActor
    func flushPosition() {
        guard let currentEpisode, isAudioLoaded else { return }
        currentEpisode.updatePosition(currentTime, flush: true)
    }

    // MARK: - Restoring across launches

    /// Puts the last-played episode back into the mini player at launch,
    /// paused and at its saved position. Nothing is loaded or downloaded
    /// until the user presses play.
    @MainActor
    func restoreLastEpisode(from context: ModelContext) {
        guard currentEpisode == nil,
              let guid = UserDefaults.standard.string(forKey: Self.lastEpisodeKey)
        else { return }

        var descriptor = FetchDescriptor<Episode>(predicate: #Predicate { $0.guid == guid })
        descriptor.fetchLimit = 1
        // The episode can legitimately be gone — a feed can drop items.
        guard let episode = try? context.fetch(descriptor).first else { return }

        currentEpisode = episode
        isPlaying = false
        currentTime = episode.positionSeconds
        duration = TimeInterval(episode.effectiveDurationSeconds ?? 0)
    }

    // MARK: - Episode sequencing

    /// The episode after the current one *within its show*, in listening
    /// order (oldest → newest by publish date) — not feed order, which
    /// interleaves every show on the network.
    ///
    /// Padlocked episodes are stepped over: with no Patreon token, running
    /// into one would end the session on an episode that can't play.
    var nextEpisode: Episode? {
        guard let currentEpisode, let show = currentEpisode.show else { return nil }
        let ordered = show.episodes.sorted { $0.listedAt < $1.listedAt }
        guard let index = ordered.firstIndex(of: currentEpisode) else { return nil }
        return ordered[(index + 1)...].first { !$0.isLocked }
    }

    /// Where the current episode sits in its show, in listening order — the
    /// "12 of 50" on the player.
    ///
    /// Deliberately its position, not its episode *number*. Time For Chaos
    /// restarts at E1 every season, so "20 of 71" would be flatly wrong for
    /// its fortieth episode, and the network's announcements carry no number
    /// at all. A position is always defined, and always agrees with the total
    /// beside it.
    ///
    /// Counted rather than sorted: the position is just how many of the show's
    /// episodes came out before this one.
    var positionInShow: (index: Int, total: Int)? {
        guard let currentEpisode, let show = currentEpisode.show else { return nil }
        let total = show.episodes.count
        guard total > 0 else { return nil }
        let listedAt = currentEpisode.listedAt
        let earlier = show.episodes.count { $0.listedAt < listedAt }
        return (earlier + 1, total)
    }

    /// Marks the current episode played and starts the show's next one.
    func playNext() {
        guard let next = nextEpisode else { return }
        currentEpisode?.markPlayed()
        play(next)
    }

    // MARK: - Time tracking

    /// Polls the AVPlayer twice a second. Simple, and it also catches the
    /// player pausing *itself* — end of episode, unplugged headphones, a
    /// phone call — and mirrors that into our observable state.
    private func startTimePolling() {
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self else { return }
                self.refreshFromPlayer()
            }
        }
    }

    private func refreshFromPlayer() {
        // A restored-but-not-started episode has nothing to poll: the
        // empty AVPlayer would report time 0 and wipe its saved position.
        guard currentEpisode != nil, isAudioLoaded else { return }

        let seconds = avPlayer.currentTime().seconds
        if seconds.isFinite {
            currentTime = seconds
        }
        // Once the audio file's headers load, AVPlayer knows the true
        // duration — prefer it over the feed's claim.
        if let itemDuration = avPlayer.currentItem?.duration, itemDuration.isNumeric {
            duration = itemDuration.seconds
        }

        // Remember where we are so play() can resume here later — but only
        // every ~5 seconds of drift, to avoid constant database writes.
        // flush: false — the database gets every one of these, iCloud
        // hears about them at CloudSyncEngine's own slower rate.
        if isPlaying, let episode = currentEpisode, abs(currentTime - episode.positionSeconds) >= 5 {
            episode.updatePosition(currentTime, flush: false)
        }

        if isPlaying && avPlayer.timeControlStatus == .paused {
            isPlaying = false

            // Distinguish the episode *finishing* from an interruption
            // (unplugged headphones, phone call): only at the end of the
            // file do we mark it played and auto-advance through the show.
            let reachedEnd = duration > 0 && currentTime >= duration - 1
            if reachedEnd {
                if nextEpisode != nil {
                    // playNext() marks this one played and frees its file.
                    playNext()
                    return
                }
                currentEpisode?.markPlayed()
            }
            updateNowPlayingInfo()
        }
    }

    // MARK: - System integration (lock screen, control centre, CarPlay)

    /// What the lock screen and CarPlay's now-playing screen display.
    /// We set elapsed time + rate on state changes; the system moves the
    /// displayed time along itself using the rate.
    private func updateNowPlayingInfo() {
        guard let currentEpisode else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentEpisode.title,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let showTitle = currentEpisode.show?.title {
            info[MPMediaItemPropertyArtist] = showTitle
        }
        if let position = positionInShow {
            // The car's now-playing screen is a system template — it has no
            // text of its own and renders whatever is put here, so "12 of 45"
            // has to travel as one of these fields. Album is the one going
            // spare: the show is already the artist, and a podcast episode has
            // no album for this to displace.
            info[MPMediaItemPropertyAlbumTitle] = Copy.Player.positionInShow(position.index, total: position.total)
            // And the same thing said properly, for anything that understands
            // a queue rather than a string. Index is zero-based.
            info[MPNowPlayingInfoPropertyPlaybackQueueIndex] = position.index - 1
            info[MPNowPlayingInfoPropertyPlaybackQueueCount] = position.total
        }
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let lockScreenArtwork {
            info[MPMediaItemPropertyArtwork] = lockScreenArtwork
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    /// Buttons on the lock screen / AirPods / CarPlay call these handlers.
    private func setUpRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.resume()
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.togglePlayPause()
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            self?.skip(by: -15)
            return .success
        }
        center.skipForwardCommand.preferredIntervals = [30]
        center.skipForwardCommand.addTarget { [weak self] _ in
            self?.skip(by: 30)
            return .success
        }
        // Dragging the lock screen scrubber.
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self?.seek(to: event.positionTime)
            return .success
        }
    }

    /// The lock screen wants a UIImage, not a URL. Goes through
    /// ArtworkLoader so it shares the thumbnail cache with the rest of the
    /// app: this used to fetch the full-size original — up to 1.5 MB —
    /// from the network on every single play, and came up blank offline.
    private func loadLockScreenArtwork(for episode: Episode) {
        lockScreenArtwork = nil
        artworkTask?.cancel()

        guard let urlString = episode.artworkUrl ?? episode.show?.artworkUrl else { return }

        artworkTask = Task { [weak self] in
            // 1024px is sized for the largest thing that asks: a car screen's
            // now-playing art. The lock screen scales down from the same copy.
            guard let image = await ArtworkLoader.image(for: urlString, pixelSize: 1024),
                  !Task.isCancelled else { return }
            self?.lockScreenArtwork = MPMediaItemArtwork(boundsSize: image.size) { size in
                // The system asks for a particular size and is entitled to
                // get one — handing every caller the same 1024px bitmap left
                // it to scale ours, which it isn't obliged to do well.
                Self.artwork(image, at: size)
            }
            self?.updateNowPlayingInfo()
        }
    }

    /// The artwork drawn at exactly the size the system asked for.
    private static func artwork(_ image: UIImage, at size: CGSize) -> UIImage {
        guard size.width > 0, size.height > 0, size != image.size else { return image }
        return UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
