//
//  DownloadManager.swift
//  GCP Player
//
//  Keeps episode audio on device so playback doesn't need the network.
//
//  Playing an episode starts the stream immediately and the download
//  alongside it, so nothing waits on a 90-minute file; the next episode in
//  the show follows, so the queue is ready before you get to it. Once a
//  file is on disk, play() uses it instead of the stream.
//
//  Downloads run on a *background* URLSession: iOS continues them while the
//  app is suspended and relaunches the app to hand over the results, which
//  a normal session can't do. The identifier has to stay stable across
//  launches — that's how the system reconnects us to work already running.
//

import Foundation
import SwiftData

@MainActor
@Observable
final class DownloadManager {
    static let shared = DownloadManager()

    /// Fraction complete per episode guid, for the download indicators.
    /// Present only while a download is in flight.
    private(set) var progress: [String: Double] = [:]

    /// Downloads older than this are swept, played or not.
    static let maximumAge: TimeInterval = 7 * 24 * 60 * 60

    /// False on Apple TV, which streams everything. A TV is always online,
    /// and the only place tvOS lets an app write is Caches — somewhere the
    /// system empties at will, which is no place to keep a file you were
    /// relying on. Everything else here still runs, so the player, the sync
    /// engines and the models call into this the same way on every platform.
    #if os(tvOS)
    static let isAvailable = false
    #else
    static let isAvailable = true
    #endif

    /// Guids the user asked for by hand, until the file lands and the flag
    /// moves onto the episode itself.
    private var manualRequests: Set<String> = []

    private var session: URLSession!
    private let sessionDelegate = SessionDelegate()

    /// Application Support, not Caches: the system purges Caches under
    /// pressure, and audio the user is relying on offline shouldn't
    /// evaporate. Excluded from backup, since it can always be fetched
    /// again — Apple requires that of re-downloadable content.
    // nonisolated: the session delegate moves the finished file into place
    // off the main actor, before it can hop back.
    nonisolated static let directory: URL = {
        #if os(tvOS)
        // Never written to on tvOS (see isAvailable), but the sweep still
        // lists it, and Application Support isn't somewhere tvOS allows.
        let location: FileManager.SearchPathDirectory = .cachesDirectory
        #else
        let location: FileManager.SearchPathDirectory = .applicationSupportDirectory
        #endif
        let base = (try? FileManager.default.url(
            for: location, in: .userDomainMask, appropriateFor: nil, create: true
        )) ?? URL.temporaryDirectory
        var directory = base.appending(path: "EpisodeAudio", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? directory.setResourceValues(values)
        return directory
    }()

    private init() {
        let configuration = URLSessionConfiguration.background(
            withIdentifier: "bencreswell.gcpplayer.downloads"
        )
        // Podcast episodes are large and never urgent: let the system pick
        // its moment, but don't hold them back waiting for Wi-Fi only.
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        session = URLSession(configuration: configuration, delegate: sessionDelegate, delegateQueue: nil)
        sessionDelegate.manager = self
        adoptRunningDownloads()
    }

    /// Downloads survive the app being killed, but `progress` doesn't — so
    /// ask the session what's still running and put the indicators back.
    private func adoptRunningDownloads() {
        session.getAllTasks { tasks in
            let running = tasks.compactMap { task -> (String, Double)? in
                guard let guid = task.taskDescription,
                      task.state == .running || task.state == .suspended
                else { return nil }
                let expected = task.countOfBytesExpectedToReceive
                let fraction = expected > 0 ? Double(task.countOfBytesReceived) / Double(expected) : 0
                return (guid, fraction)
            }
            guard !running.isEmpty else { return }
            Task { @MainActor in
                for (guid, fraction) in running {
                    DownloadManager.shared.progress[guid] = fraction
                }
            }
        }
    }

    // MARK: - Reading

    /// The playable local file, or nil when this episode isn't downloaded.
    /// Checks the file really exists: the row can outlive the file if the
    /// container is rebuilt or the user offloads the app.
    func localURL(for episode: Episode) -> URL? {
        guard let name = episode.downloadFileName else { return nil }
        let url = Self.directory.appending(path: name)
        guard FileManager.default.fileExists(atPath: url.path) else {
            // Stale bookkeeping — forget it so the UI stops claiming offline.
            episode.downloadFileName = nil
            episode.downloadedAt = nil
            return nil
        }
        return url
    }

    func isDownloading(_ episode: Episode) -> Bool {
        progress[episode.guid] != nil
    }

    // MARK: - Fetching

    /// Starts a download unless the episode is already held or already
    /// downloading. Automatic downloads also skip anything already heard;
    /// a request made by hand doesn't — wanting a second listen is a
    /// perfectly good reason to keep a file.
    ///
    /// With a Patreon token, a Patreon episode downloads Patreon's copy — the
    /// ad-free one — whose URL has to be fetched from the patron's feed
    /// first. The indicator shows from the moment of asking, so a second
    /// request while that's under way is still refused.
    func downloadIfNeeded(_ episode: Episode, manual: Bool = false) {
        guard Self.isAvailable,
              !episode.isLocked,
              manual || !episode.isPlayed,
              localURL(for: episode) == nil,
              progress[episode.guid] == nil
        else { return }

        if manual { manualRequests.insert(episode.guid) }

        guard episode.playsFromPatreon else {
            guard let url = episode.audioUrl.flatMap(URL.init(string:)) else {
                manualRequests.remove(episode.guid)
                return
            }
            startDownload(episode, from: url)
            return
        }

        progress[episode.guid] = 0
        Task {
            var url: URL?
            do {
                url = try await PatreonFeeds.shared.audio(for: episode).url
            } catch {
                // The public copy, where there is one, rather than nothing.
                url = episode.audioUrl.flatMap(URL.init(string:))
                print("[downloads] Patreon failed for \(episode.title): \(error.localizedDescription)")
            }
            // Removed, or its row deleted, while Patreon was answering.
            guard progress[episode.guid] != nil, let url else {
                progress[episode.guid] = nil
                manualRequests.remove(episode.guid)
                return
            }
            startDownload(episode, from: url)
        }
    }

    private func startDownload(_ episode: Episode, from url: URL) {
        // Per-request rather than per-session: a background session's
        // configuration is fixed once created, but the setting can change
        // at any time. A task barred from cellular waits for Wi-Fi instead
        // of failing.
        var request = URLRequest(url: url)
        request.allowsCellularAccess = !Settings.wifiOnly

        let task = session.downloadTask(with: request)
        // Survives the app being killed and relaunched mid-download, which
        // an object reference wouldn't.
        task.taskDescription = episode.guid
        progress[episode.guid] = 0
        task.resume()

        // Artwork is part of being usable offline: without it the player
        // and the lock screen come up blank. Cheap — these are thumbnails.
        prefetchArtwork(for: episode)
    }

    private func prefetchArtwork(for episode: Episode) {
        guard let urlString = episode.artworkUrl ?? episode.show?.artworkUrl else { return }
        Task.detached(priority: .utility) {
            // The now-playing size at 3x. Smaller sizes are derived from
            // this one without another request — see ArtworkLoader.
            _ = await ArtworkLoader.image(for: urlString, pixelSize: 750)
        }
    }

    // MARK: - Removing

    func removeDownload(for episode: Episode) {
        if let name = episode.downloadFileName {
            try? FileManager.default.removeItem(at: Self.directory.appending(path: name))
        }
        episode.downloadFileName = nil
        episode.downloadedAt = nil
        episode.downloadIsManual = false
        progress[episode.guid] = nil
        manualRequests.remove(episode.guid)
    }

    /// The housekeeping pass: drop anything heard or older than a week, and
    /// any file no episode claims. Runs at launch.
    func purgeExpired(in context: ModelContext) {
        let descriptor = FetchDescriptor<Episode>(
            predicate: #Predicate { $0.downloadFileName != nil }
        )
        let downloaded = (try? context.fetch(descriptor)) ?? []
        let cutoff = Date.now.addingTimeInterval(-Self.maximumAge)

        var kept: Set<String> = []
        for episode in downloaded {
            let expired = (episode.downloadedAt ?? .distantPast) < cutoff
            if (episode.isPlayed && !episode.downloadIsManual) || expired {
                removeDownload(for: episode)
            } else if let name = episode.downloadFileName {
                kept.insert(name)
            }
        }

        // Files with no episode pointing at them: a download that landed
        // after its episode was deleted, or a half-finished move.
        let files = (try? FileManager.default.contentsOfDirectory(
            at: Self.directory, includingPropertiesForKeys: nil, options: .skipsHiddenFiles
        )) ?? []
        for file in files where !kept.contains(file.lastPathComponent) {
            // Leave alone anything currently being written.
            guard !progress.keys.contains(where: { Self.fileName(forGuid: $0, url: nil) == file.lastPathComponent })
            else { continue }
            try? FileManager.default.removeItem(at: file)
        }

        try? context.save()
    }

    // MARK: - Delegate callbacks

    fileprivate func update(guid: String, fraction: Double) {
        progress[guid] = fraction
    }

    /// The file is already in place by the time this runs — the delegate has
    /// to move it synchronously, before the system deletes the temp copy.
    fileprivate func finished(guid: String, fileName: String) {
        progress[guid] = nil

        let context = AppDatabase.container.mainContext
        var descriptor = FetchDescriptor<Episode>(predicate: #Predicate { $0.guid == guid })
        descriptor.fetchLimit = 1
        guard let episode = try? context.fetch(descriptor).first else {
            // No episode to attach it to; don't leave the file orphaned.
            try? FileManager.default.removeItem(at: Self.directory.appending(path: fileName))
            return
        }

        episode.downloadFileName = fileName
        episode.downloadedAt = .now
        episode.downloadIsManual = manualRequests.remove(guid) != nil
        try? context.save()
    }

    fileprivate func failed(guid: String) {
        progress[guid] = nil
    }

    /// Stable name from the guid, so a relaunched download lands in the
    /// same place. The extension comes from the audio URL where we have it,
    /// because AVPlayer uses it to pick a decoder.
    // nonisolated: the session delegate names the file before it can hop
    // to the main actor — the temp copy has to be moved synchronously.
    nonisolated fileprivate static func fileName(forGuid guid: String, url: URL?) -> String {
        let safe = guid.replacing(#/[^A-Za-z0-9]+/#, with: "-").prefix(60)
        let ext = url?.pathExtension ?? ""
        return "\(safe).\(ext.isEmpty ? "mp3" : ext)"
    }
}

// MARK: - URLSession delegate
//
// Separate from the manager because these callbacks arrive off the main
// actor, on the session's own queue.

private final class SessionDelegate: NSObject, URLSessionDownloadDelegate {
    /// Set once, on the main actor, right after the manager is built.
    nonisolated(unsafe) weak var manager: DownloadManager?

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didFinishDownloadingTo location: URL) {
        guard let guid = downloadTask.taskDescription else { return }
        let fileName = DownloadManager.fileName(forGuid: guid, url: downloadTask.originalRequest?.url)
        let destination = DownloadManager.directory.appending(path: fileName)

        // Synchronously, here: `location` is deleted as soon as we return.
        try? FileManager.default.removeItem(at: destination)
        do {
            try FileManager.default.moveItem(at: location, to: destination)
        } catch {
            Task { @MainActor in DownloadManager.shared.failed(guid: guid) }
            return
        }

        Task { @MainActor in DownloadManager.shared.finished(guid: guid, fileName: fileName) }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didWriteData bytesWritten: Int64, totalBytesWritten: Int64,
                    totalBytesExpectedToWrite: Int64) {
        guard let guid = downloadTask.taskDescription, totalBytesExpectedToWrite > 0 else { return }
        let fraction = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        Task { @MainActor in DownloadManager.shared.update(guid: guid, fraction: fraction) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard error != nil, let guid = task.taskDescription else { return }
        Task { @MainActor in DownloadManager.shared.failed(guid: guid) }
    }
}
