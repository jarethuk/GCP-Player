//
//  APIClient.swift
//  GCP Player
//
//  Talks to the catalogue API in ../../api. That service reads the network's
//  nine RSS feeds and reconciles them; the app no longer parses feeds itself.
//
//  Both endpoints are deltas: pass the `syncedAt` from the previous response
//  as `since` and only what changed since comes back. The app still keeps a
//  full local copy — working with no signal is most of the point — so this is
//  about keeping that copy current cheaply, not about fetching on demand.
//
//  Responses are cached at the edge for an hour, so most of these calls never
//  reach the API's database. That only works because every client converges on
//  the same handful of `since` values: `syncedAt` is the whole collection's
//  newest timestamp rather than the newest row in one response, so two apps
//  that last synced at different times still end up requesting the same URL.
//

import Foundation

enum APIConfig {
    /// Where the API lives.
    ///
    /// Overridable at runtime so a build can be pointed at a local checkout or
    /// a staging deploy without rebuilding:
    ///
    ///     -APIBaseURL http://localhost:7331
    ///
    /// as a launch argument in the scheme, which UserDefaults reads for free.
    static let baseURL: URL = {
        if let override = UserDefaults.standard.string(forKey: "APIBaseURL"),
           let url = URL(string: override) {
            return url
        }
        if let configured = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           let url = URL(string: configured) {
            return url
        }
        return URL(string: "https://gcp-player-api.vercel.app")!
    }()
}

// MARK: - Wire types

/// The envelope both endpoints return.
///
/// `syncedAt` is the highest `updatedAt` the server actually returned rather
/// than its clock, so storing it and passing it back can't skip a row that
/// committed moments after the response was built.
struct ShowsResponse: Decodable {
    let syncedAt: Date
    let fullResync: Bool
    let shows: [ShowDTO]
}

struct EpisodesResponse: Decodable {
    let syncedAt: Date
    let fullResync: Bool
    let episodes: [EpisodeDTO]
}

struct ShowDTO: Decodable {
    let id: String
    let slug: String
    let title: String
    let system: String?
    let description: String?
    let artworkUrl: String?
    /// The Patreon collection — the `show=` of a patron's feed URL.
    let patreonShowId: String?
    /// False for a show that exists only on Patreon. Optional so a build
    /// pointed at an API that predates Patreon still decodes.
    let isPublic: Bool?
    let updatedAt: Date
    /// Non-null means this row is a tombstone: drop the local copy.
    let deletedAt: Date?
}

struct EpisodeDTO: Decodable {
    let id: String
    let showId: String?
    let guid: String
    let title: String
    let rawTitle: String
    let description: String?
    /// nil for an episode that is so far only on Patreon.
    let audioUrl: String?
    /// The Patreon post — the `<guid>` of the item in a patron's feed.
    let patreonPostId: String?
    /// When Patreon published it; a patron's list is ordered by this.
    let patreonPublishedAt: Date?
    let durationSeconds: Int?
    let publishedAt: Date
    let season: Int?
    let number: Int?
    let artworkUrl: String?
    /// The episode's video version on YouTube, where the feed mentions one.
    /// Optional in the Swift sense as well as the JSON one: a build running
    /// against an API that predates the column decodes it as nil rather than
    /// failing the whole sync.
    let videoUrl: String?
    let updatedAt: Date
    /// Non-null means this row is a tombstone: drop the local copy, and
    /// whatever was downloaded of it.
    let deletedAt: Date?
}

enum APIError: LocalizedError {
    case badStatus(Int)
    case notFound

    var errorDescription: String? {
        switch self {
        case .badStatus(let code): Copy.Errors.catalogueStatus(code)
        case .notFound: Copy.Errors.showGone
        }
    }
}

// MARK: - Client

enum APIClient {

    /// The shows that changed since `since`, tombstones included. Pass nil on
    /// a first sync to get the whole catalogue.
    ///
    /// Which shows come back is the *only* signal the app needs about what to
    /// look at next: the API marks a show whenever its episodes change, not
    /// only when its own fields are edited, so a show that isn't here has
    /// nothing new underneath it either.
    ///
    /// Both calls ask for Patreon (`patreon=1`): Patreon-only shows, and
    /// episodes with no public audio. Without it the API answers as it did for
    /// the builds that predate Patreon, whose decoders a null `audioUrl` would
    /// break.
    static func fetchShows(since: Date?) async throws -> ShowsResponse {
        try await get(path: "/shows", since: since)
    }

    /// One show's episodes, changed since `since`. Addressed by slug — the API
    /// accepts either its own id or the slug, and the slug is what the local
    /// store already keys on.
    static func fetchEpisodes(showSlug: String, since: Date?) async throws -> EpisodesResponse {
        try await get(path: "/shows/\(showSlug)/episodes", since: since)
    }

    // MARK: - Transport

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        // The API sends ISO-8601 with milliseconds ("…T11:07:09.650Z").
        // JSONDecoder's built-in .iso8601 rejects the fractional part, which
        // fails on every single row rather than visibly.
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = withFraction.date(from: text) ?? plain.date(from: text) {
                return date
            }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Bad date: \(text)")
            )
        }
        return decoder
    }()

    private static func get<T: Decodable>(path: String, since: Date?) async throws -> T {
        var components = URLComponents(
            url: APIConfig.baseURL.appending(path: path),
            resolvingAgainstBaseURL: false
        )
        var query = [URLQueryItem(name: "patreon", value: "1")]
        if let since {
            // Milliseconds included: the cursor is compared with `>` against a
            // millisecond-precision column, and a truncated one would re-fetch
            // the boundary row every time.
            query.append(URLQueryItem(name: "since", value: iso8601(since)))
        }
        components?.queryItems = query
        guard let url = components?.url else { throw APIError.badStatus(0) }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw http.statusCode == 404 ? APIError.notFound : APIError.badStatus(http.statusCode)
        }
        return try decoder.decode(T.self, from: data)
    }

    private static let cursorFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static func iso8601(_ date: Date) -> String {
        cursorFormatter.string(from: date)
    }
}
