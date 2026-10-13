//
//  Patreon.swift
//  GCP Player
//
//  Patreon, from the listener's side.
//
//  The API knows every Patreon episode — the shows that exist only there,
//  and the early releases of the ones that don't — but it never has their
//  audio. That lives in each patron's personal RSS feed, whose URL carries
//  their own token:
//
//      https://www.patreon.com/rss/glasscannon?auth=<token>&show=<collection>
//
//  So the token is pasted in here, once, and the app asks that feed for an
//  episode's audio at the moment it is played or downloaded. Nothing about it
//  goes near the API.
//
//  Three things follow:
//
//  - **Without a token, Patreon episodes are shown but padlocked.** They are
//    part of the show, and hiding them would make a Patreon-only show look
//    empty and an early release look like it doesn't exist.
//  - **With one, Patreon's copy is the one that plays** — the public
//    episodes' too, wherever the API has matched them to a post, because
//    Patreon's has no ads. Its runtime differs by exactly that, so it is read
//    from the feed alongside the audio URL and kept on the episode.
//  - **The token syncs**, like listening state, through the user's private
//    iCloud database — see CloudSyncEngine. Pasting it on the phone unlocks
//    the iPad and the Apple TV.
//

import Foundation
import OSLog
import SwiftData

private let log = Logger(subsystem: "bencreswell.gcpplayer", category: "patreon")

// MARK: - The token

@MainActor
@Observable
final class PatreonAccount {
    static let shared = PatreonAccount()

    /// The patron's feed token, or nil. Never logged.
    private(set) var token: String?

    /// Bumped whenever the token appears, changes or goes — the shows lists'
    /// cue to recount, since what counts as unplayed and new depends on it.
    private(set) var changedAt: Date?

    var hasToken: Bool { token != nil }

    /// The creator's feed. The campaign id works in its place; the name is
    /// what Patreon's own "copy RSS link" hands out.
    static let feedBase = URL(string: "https://www.patreon.com/rss/glasscannon")!

    private var context: ModelContext { AppDatabase.container.mainContext }

    private init() {
        token = credential()?.token
    }

    /// Takes the token out of a pasted feed link. Anything Patreon hands out
    /// works — the link from "Copy RSS link", with or without `&show=`, or
    /// the URL of a single episode's audio (`/api/rss/u/<token>/e/…`).
    /// nil if there is no token in it.
    nonisolated static func token(fromFeedLink text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed),
              components.host?.hasSuffix("patreon.com") == true
        else { return nil }

        if let auth = components.queryItems?.first(where: { $0.name == "auth" })?.value,
           isPlausible(auth) {
            return auth
        }
        let parts = components.path.split(separator: "/")
        if let index = parts.firstIndex(of: "u"), index + 1 < parts.count,
           parts[..<index].suffix(2) == ["api", "rss"] {
            let candidate = String(parts[index + 1])
            if isPlausible(candidate) { return candidate }
        }
        return nil
    }

    nonisolated private static func isPlausible(_ token: String) -> Bool {
        token.count >= 16 && token.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }

    /// Sets or clears the token on this device, and offers the change to the
    /// others.
    func setToken(_ newToken: String?) {
        let row = credential() ?? {
            let created = PatreonCredential()
            context.insert(created)
            return created
        }()
        row.token = newToken
        row.updatedAt = .now
        try? context.save()
        adopt(newToken)
        CloudSyncEngine.shared.enqueuePatreonCredential()
    }

    /// The row, for CloudSyncEngine, which reads and writes it directly.
    func credential() -> PatreonCredential? {
        var descriptor = FetchDescriptor<PatreonCredential>()
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    /// Makes the token in the database the one in use. CloudSyncEngine calls
    /// this after writing one that arrived from another device.
    func reload() {
        adopt(credential()?.token)
    }

    private func adopt(_ newToken: String?) {
        guard newToken != token else { return }
        token = newToken
        PatreonFeeds.shared.forget()
        log.info("patreon token \(newToken == nil ? "removed" : "set", privacy: .public)")

        // Nothing to re-sort — the lists order shows the same either way —
        // but what counts as NEW, and which rows wear a padlock, has moved.
        changedAt = .now
    }
}

// MARK: - The audio

/// One episode's Patreon audio, as the patron's feed describes it.
struct PatreonAudio: Sendable {
    let url: URL
    let durationSeconds: Int?
}

enum PatreonError: LocalizedError {
    case noToken
    case notOnPatreon
    case rejected(Int)
    case notInFeed

    var errorDescription: String? {
        switch self {
        case .noToken: Copy.Patreon.errorNoToken
        case .notOnPatreon: Copy.Patreon.errorNotOnPatreon
        case .rejected(let status) where status == 401 || status == 403 || status == 404:
            Copy.Patreon.errorRejected
        case .rejected(let status): Copy.Patreon.errorStatus(status)
        case .notInFeed: Copy.Patreon.errorNotInFeed
        }
    }
}

/// The patron's feeds, one per show, fetched when something needs audio from
/// them and kept for a while — a show's feed is a few hundred kilobytes and
/// playing, then downloading the next episode, asks for the same one twice.
@MainActor
final class PatreonFeeds {
    static let shared = PatreonFeeds()

    /// Long enough to cover a listening session, short enough that a post
    /// published since shows up — and a missing post refetches anyway.
    private static let lifetime: TimeInterval = 30 * 60

    private var feeds: [String: (fetchedAt: Date, items: [String: PatreonAudio])] = [:]
    private var inFlight: [String: Task<[String: PatreonAudio], Error>] = [:]

    /// Where to play or download `episode` from on Patreon, and how long
    /// Patreon's copy runs. The runtime is kept on the episode, so lists show
    /// it from then on.
    func audio(for episode: Episode) async throws -> PatreonAudio {
        guard let token = PatreonAccount.shared.token else { throw PatreonError.noToken }
        guard let postId = episode.patreonPostId, let showId = episode.show?.patreonShowId else {
            throw PatreonError.notOnPatreon
        }

        var items = try await feed(showId: showId, token: token, allowCached: true)
        if items[postId] == nil, feeds[showId].map({ Date.now.timeIntervalSince($0.fetchedAt) > 5 }) ?? true {
            // Published since the cached copy was fetched.
            items = try await feed(showId: showId, token: token, allowCached: false)
        }
        guard let audio = items[postId] else { throw PatreonError.notInFeed }

        if let seconds = audio.durationSeconds, episode.patreonDurationSeconds != seconds {
            episode.patreonDurationSeconds = seconds
        }
        return audio
    }

    /// Whether `token` opens this show's feed — asked before a pasted link is
    /// kept, so a wrong one is caught on the Settings screen rather than on
    /// the first play.
    func check(token: String, showId: String) async throws {
        let items = try await feed(showId: showId, token: token, allowCached: false)
        if items.isEmpty { throw PatreonError.rejected(403) }
    }

    /// Drops everything fetched — the URLs inside carry the old token.
    func forget() {
        feeds = [:]
        for task in inFlight.values { task.cancel() }
        inFlight = [:]
    }

    private func feed(showId: String, token: String, allowCached: Bool) async throws -> [String: PatreonAudio] {
        if allowCached, let cached = feeds[showId],
           Date.now.timeIntervalSince(cached.fetchedAt) < Self.lifetime {
            return cached.items
        }
        if let running = inFlight[showId] { return try await running.value }

        var components = URLComponents(url: PatreonAccount.feedBase, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "auth", value: token),
            URLQueryItem(name: "show", value: showId),
        ]
        let url = components.url!

        let task = Task.detached(priority: .userInitiated) { () throws -> [String: PatreonAudio] in
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw PatreonError.rejected(http.statusCode)
            }
            return PatreonFeedParser.parse(data)
        }
        inFlight[showId] = task
        defer { inFlight[showId] = nil }

        let items = try await task.value
        // Only if the token is still the one it was fetched with.
        if PatreonAccount.shared.token == token {
            feeds[showId] = (.now, items)
        }
        log.info("patreon feed for show \(showId, privacy: .public): \(items.count) items")
        return items
    }
}

/// Reads a patron's feed down to what playing needs: each item's Patreon post
/// id — what the API calls `patreonPostId` — its enclosure, and its
/// `<itunes:duration>`.
///
/// The post id comes from the item's `<link>`, not its `<guid>`. The guid is
/// the post id only for posts made on Patreon; the network's back catalogue
/// was imported from Supercast and kept Supercast's guids, a URL each — 178 of
/// Blood of the Wild's 203. The link is always the post's page, ending
/// `-<post id>`.
nonisolated enum PatreonFeedParser {
    nonisolated static func parse(_ data: Data) -> [String: PatreonAudio] {
        let delegate = Delegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.parse()
        return delegate.items
    }

    /// `https://www.patreon.com/glasscannon/posts/war-breaks-out-154017528` → `154017528`.
    nonisolated static func postId(fromLink link: String) -> String? {
        guard let match = link.firstMatch(of: #/\/posts\/(?:[^\/?#]*-)?(\d+)(?:[\/?#]|$)/#) else { return nil }
        return String(match.1)
    }

    nonisolated private final class Delegate: NSObject, XMLParserDelegate {
        var items: [String: PatreonAudio] = [:]

        private var inItem = false
        private var text = ""
        private var guid: String?
        private var link: String?
        private var enclosure: URL?
        private var duration: Int?

        func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
                    qualifiedName: String?, attributes: [String: String] = [:]) {
            text = ""
            switch name {
            case "item":
                inItem = true
                guid = nil
                link = nil
                enclosure = nil
                duration = nil
            case "enclosure" where inItem:
                enclosure = attributes["url"].flatMap(URL.init(string:))
            default:
                break
            }
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            text += string
        }

        func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?,
                    qualifiedName: String?) {
            guard inItem else { return }
            let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
            switch name {
            case "guid":
                guid = value
            case "link":
                link = value
            case "itunes:duration":
                duration = Self.seconds(value)
            case "item":
                inItem = false
                let postId = link.flatMap(PatreonFeedParser.postId(fromLink:))
                    ?? guid.flatMap { $0.allSatisfy(\.isNumber) ? $0 : nil }
                if let postId, let enclosure {
                    items[postId] = PatreonAudio(url: enclosure, durationSeconds: duration)
                }
            default:
                break
            }
        }

        /// `4353`, `72:33` or `1:12:33`.
        private static func seconds(_ value: String) -> Int? {
            let parts = value.split(separator: ":").compactMap { Int($0) }
            guard !parts.isEmpty, parts.count <= 3 else { return nil }
            return parts.reduce(0) { $0 * 60 + $1 }
        }
    }
}
