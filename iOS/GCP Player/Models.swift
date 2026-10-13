//
//  Models.swift
//  GCP Player
//
//  The app's database schema. @Model classes are persisted to an on-device
//  SwiftData store; the schema mirrors the Prisma schema in the gcp API.
//

import Foundation
import SwiftData

@Model
final class Show {
    // .unique: SwiftData enforces one row per slug/title, like a
    // UNIQUE column in SQL.
    @Attribute(.unique) var slug: String
    @Attribute(.unique) var title: String

    /// Game system or campaign, e.g. "Pathfinder 2E" (display only).
    var system: String?
    var artworkUrl: String?

    /// The Patreon collection this show is posted into — the `show=` of a
    /// patron's feed URL, which is where its Patreon audio comes from. nil
    /// for a show that isn't on Patreon.
    var patreonShowId: String?

    /// False for a show that exists only on Patreon: without a token, none
    /// of it plays.
    var isPublic: Bool = true

    /// The `syncedAt` from this show's last episodes response, passed back as
    /// `?since=` on the next one. nil means "never synced", which asks the API
    /// for the show's whole back catalogue.
    ///
    /// Per show rather than one cursor for everything, because the API's
    /// episode delta is scoped to a show — and because a show whose request
    /// fails must not advance a cursor the others share.
    var episodesSyncedAt: Date?

    /// When this show last published. Kept on the show so the shows list
    /// can be sorted by it in the database — SwiftData can't sort on the
    /// maximum of a relationship, and working it out in the view would
    /// mean faulting every episode of every show on each redraw.
    /// `.distantPast` until the first sync fills it in; maintained by
    /// SyncEngine, like the rest of the API-derived fields.
    var latestEpisodeAt: Date = Date.distantPast

    /// The newest episode anyone can play, and the newest of all of them,
    /// Patreon's included. The lists sort on the second whether or not this
    /// device has a Patreon token — a show that has just published is at the
    /// top either way — but without one only the first can make it NEW. See
    /// `hasNewEpisode` and `hasLockedNewEpisode`.
    var latestPublicEpisodeAt: Date = Date.distantPast
    var latestAnyEpisodeAt: Date = Date.distantPast

    /// Starred by the user ("My Shows"). Local state, never touched by
    /// feed syncing. The `= false` default is what lets SwiftData migrate
    /// existing stores when this property is added.
    var isStarred: Bool = false

    /// When this device last changed `isStarred`, and nil if it never has.
    /// The stamp is what settles a disagreement between two devices — the
    /// later change wins — and nil is also how CloudSyncEngine knows this
    /// show has nothing worth a record in iCloud yet.
    var starredUpdatedAt: Date?

    /// The system fields of this show's iCloud record: its id, change tag
    /// and timestamps, without any of the values.
    ///
    /// CloudKit only accepts a save that carries the change tag of the copy
    /// it already holds — that is how it spots a conflict. Saving a freshly
    /// built record instead would be rejected every single time and cost a
    /// round trip to recover, so the tag is kept here, next to the row it
    /// describes. nil until this show has been up once.
    var cloudRecordData: Data?

    // One show has many episodes. .nullify: deleting a show sets its
    // episodes' show to nil instead of deleting them.
    @Relationship(deleteRule: .nullify, inverse: \Episode.show)
    var episodes: [Episode] = []

    init(slug: String, title: String, system: String? = nil, artworkUrl: String? = nil) {
        self.slug = slug
        self.title = title
        self.system = system
        self.artworkUrl = artworkUrl
    }
}

@Model
final class Episode {
    /// The RSS <guid> — the episode's stable identity. Syncing upserts on
    /// this, so re-fetching the feed never creates duplicates.
    @Attribute(.unique) var guid: String

    /// Cleaned title with show/system segments stripped, e.g. "Shaggy's Fight".
    var title: String
    /// The full original feed title, kept for auditing and re-parsing.
    var rawTitle: String

    // "description" clashes with an Objective-C property on NSObject,
    // so SwiftData models conventionally prefix it.
    var episodeDescription: String?

    /// The public enclosure. nil for an episode that so far exists only on
    /// Patreon: its audio comes from the patron's own feed, fetched when it
    /// is played or downloaded — see Patreon.swift.
    var audioUrl: String?
    /// The Patreon post, where the episode is on Patreon. With a token this
    /// is the copy that plays, even when there is a public one: Patreon's
    /// has no ads.
    var patreonPostId: String?
    var durationSeconds: Int?
    /// Patreon's runtime, learnt from the patron's feed the first time the
    /// episode is played or downloaded from there. It differs from the
    /// public one by the length of the ads it hasn't got.
    var patreonDurationSeconds: Int?
    var publishedAt: Date
    /// When Patreon published it, where it is on Patreon — for an early
    /// release, months before `publishedAt`. With a Patreon token this is the
    /// date the episode is listed and ordered by. See `listedAt`.
    var patreonPublishedAt: Date?
    var season: Int?
    var number: Int?
    var artworkUrl: String?

    /// The episode's video version on YouTube, where the network filmed one —
    /// roughly half the catalogue. See WatchOnYouTube.swift for why this is a
    /// link out rather than something this app plays.
    var videoUrl: String?

    /// Listened-to flag. Local user state, never touched by feed syncing.
    var isPlayed: Bool = false

    /// Where playback left off, in seconds, so an episode resumes rather
    /// than restarts. Local user state, like isPlayed.
    var positionSeconds: TimeInterval = 0

    /// The downloaded audio file's name, inside DownloadManager's folder,
    /// or nil when this episode isn't held offline. The name rather than a
    /// full path: an app's container moves between launches and OS
    /// upgrades, so an absolute path saved today can be wrong tomorrow.
    var downloadFileName: String?

    /// When the download finished — what the 7-day sweep measures.
    var downloadedAt: Date?

    /// True when the user asked for this download from the menu rather
    /// than it arriving automatically. The sweep drops played episodes'
    /// downloads, which would quietly undo a deliberate request to keep an
    /// episode you've already heard; the week-old rule still applies.
    var downloadIsManual: Bool = false

    /// When this device last changed `isPlayed` or `positionSeconds`, and
    /// nil if it never has. See `Show.starredUpdatedAt` — same job.
    var stateUpdatedAt: Date?

    /// This episode's iCloud record, system fields only. See
    /// `Show.cloudRecordData`.
    var cloudRecordData: Data?

    /// nil = the episode couldn't be attributed to a show. Kept, not dropped,
    /// so feed format changes surface as unattributed counts.
    var show: Show?

    init(guid: String, title: String, rawTitle: String, episodeDescription: String? = nil, audioUrl: String?, durationSeconds: Int? = nil, publishedAt: Date, season: Int? = nil, number: Int? = nil, artworkUrl: String? = nil, videoUrl: String? = nil, show: Show? = nil) {
        self.guid = guid
        self.title = title
        self.rawTitle = rawTitle
        self.episodeDescription = episodeDescription
        self.audioUrl = audioUrl
        self.durationSeconds = durationSeconds
        self.publishedAt = publishedAt
        self.season = season
        self.number = number
        self.artworkUrl = artworkUrl
        self.videoUrl = videoUrl
        self.show = show
    }
}

extension Episode {
    /// "42 min" — for list rows and the episode screen.
    @MainActor
    var durationText: String {
        guard let effectiveDurationSeconds else { return "" }
        return Copy.Episode.duration(effectiveDurationSeconds / 60)
    }

    /// The date this episode is listed and ordered by.
    ///
    /// For a patron, Patreon's: an early release came out when Patreon
    /// posted it, and ordering by the public date would put everything
    /// Patreon had first — We Shouldn't Be Alive's first twenty episodes, and
    /// all their debriefs — in the wrong order around each other. Without a
    /// token the public date, which is when this listener could first hear it.
    @MainActor
    var listedAt: Date {
        PatreonAccount.shared.hasToken ? (patreonPublishedAt ?? publishedAt) : publishedAt
    }

    /// The runtime of the copy that will actually play.
    @MainActor
    var effectiveDurationSeconds: Int? {
        playsFromPatreon ? (patreonDurationSeconds ?? durationSeconds) : durationSeconds
    }

    /// On Patreon only, with no public audio yet: a Patreon-only show's
    /// episode, or an early release.
    var isPatreonExclusive: Bool { audioUrl == nil && patreonPostId != nil }

    /// Can't be played on this device: it is Patreon's alone, and there is
    /// no token to reach it with. Shown, but padlocked.
    @MainActor
    var isLocked: Bool { audioUrl == nil && !PatreonAccount.shared.hasToken }

    /// Plays from the patron's feed rather than the public one — which is
    /// every Patreon episode once there is a token, the public ones included,
    /// because Patreon's copy has no ads.
    @MainActor
    var playsFromPatreon: Bool { patreonPostId != nil && PatreonAccount.shared.hasToken }

    /// The feed's descriptions are HTML. Crudely strip tags and common
    /// entities for display — proper HTML rendering can come later.
    var plainDescription: String? {
        guard let episodeDescription else { return nil }
        let stripped = episodeDescription
            .replacing(#/<[^>]+>/#, with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacing(#/\s+/#, with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return stripped.isEmpty ? nil : stripped
    }

    /// Held on device for offline playback.
    var isDownloaded: Bool { downloadFileName != nil }

    /// Marks the episode heard and drops its download — the whole point of
    /// keeping audio is that you haven't heard it yet. Every place that
    /// marks an episode played goes through here so nothing is left behind
    /// on disk.
    @MainActor
    func markPlayed(_ played: Bool = true) {
        isPlayed = played
        positionSeconds = 0
        noteStateChanged(flush: true)
        if played {
            DownloadManager.shared.removeDownload(for: self)
        }
    }

    /// Moves the saved position, and says whether the other devices should
    /// hear about it now.
    ///
    /// `flush: false` is the every-five-seconds write from the player's
    /// poll: the position lands in the database, as it always has, but
    /// iCloud hears about it at most every couple of minutes. Pausing,
    /// scrubbing, finishing and backgrounding all pass `true` — the moments
    /// when you might pick up the other device.
    @MainActor
    func updatePosition(_ seconds: TimeInterval, flush: Bool) {
        positionSeconds = seconds
        noteStateChanged(flush: flush)
    }

    /// Stamps this device's change and offers it to iCloud. Every write to
    /// `isPlayed` or `positionSeconds` outside a sync import goes through
    /// here — an unstamped change is one the other device would ignore as
    /// older than it is.
    @MainActor
    private func noteStateChanged(flush: Bool) {
        stateUpdatedAt = .now
        CloudSyncEngine.shared.enqueue(self, flush: flush)
    }

    /// Marks every episode of the same show published before this one.
    ///
    /// Dozens of rows in one go, each one stamped and offered to iCloud
    /// separately — CKSyncEngine collects them into as few uploads as it
    /// can, so this is one batch, not one request per episode.
    @MainActor
    func markAllPreviousPlayed() {
        guard let show else { return }
        let listedAt = listedAt
        for other in show.episodes where other.listedAt < listedAt && !other.isPlayed {
            other.markPlayed()
        }
    }
}

extension Show {
    /// Five days. Nearly every show on the network is weekly — 21 of the 23 with
    /// enough history publish at least that often, and the median gap is exactly
    /// seven days — so the chip marks the current episode and then goes out for a
    /// day or two before the next one lands. A badge that is always lit says
    /// nothing.
    static let recentWindow: TimeInterval = 5 * 24 * 60 * 60

    /// "New" has to mean *newly published*, not merely unheard — on a back
    /// catalogue this size almost every show has something unplayed, and a
    /// badge on every row is a badge on none.
    ///
    /// On Show rather than in a row, because three rows ask now: the phone's
    /// list, the iPad's sidebar and the poster wall.
    ///
    /// Only what this device can play counts: without a Patreon token, a
    /// public show's early release doesn't make it NEW. `unplayedCount` is
    /// already counted that way — see ShowsModel.
    @MainActor
    func hasNewEpisode(unplayedCount: Int) -> Bool {
        let latest = PatreonAccount.shared.hasToken ? latestAnyEpisodeAt : latestPublicEpisodeAt
        return unplayedCount > 0 && latest > Date.now.addingTimeInterval(-Self.recentWindow)
    }

    /// A padlock where the NEW chip would be: there is no Patreon token, and
    /// what the show has is Patreon's — a Patreon-only show, always, or a
    /// public one whose newest episode is an early release. It sorts near
    /// the top on that episode, and without this the row would say nothing
    /// about why.
    @MainActor
    func hasLockedNewEpisode(unplayedCount: Int) -> Bool {
        guard !PatreonAccount.shared.hasToken, !hasNewEpisode(unplayedCount: unplayedCount) else {
            return false
        }
        if !isPublic { return true }
        return latestAnyEpisodeAt > latestPublicEpisodeAt
            && latestAnyEpisodeAt > Date.now.addingTimeInterval(-Self.recentWindow)
    }

    /// Keeps `latestEpisodeAt` — what every list sorts on — at the newest
    /// episode of any kind, Patreon's included, token or not.
    @MainActor
    func refreshLatest() {
        if latestEpisodeAt != latestAnyEpisodeAt { latestEpisodeAt = latestAnyEpisodeAt }
    }

    /// The next episode to listen to: oldest unheard, in listening order.
    /// nil when the show is finished — or empty, or nothing left in it plays
    /// without Patreon.
    @MainActor
    var nextUnplayed: Episode? {
        episodes.filter { !$0.isPlayed && !$0.isLocked }.min { $0.listedAt < $1.listedAt }
    }

    /// Stars or unstars the show, stamped so the other devices can tell
    /// whose change is the later one. The only way `isStarred` is written
    /// outside a sync import.
    @MainActor
    func setStarred(_ starred: Bool) {
        guard isStarred != starred else { return }
        isStarred = starred
        starredUpdatedAt = .now
        CloudSyncEngine.shared.enqueue(self)
    }
}

/// The user's Patreon feed token, kept in the database rather than in the
/// keychain so it can travel to their other devices beside everything else
/// CloudSyncEngine carries — as an encrypted field, in their own private
/// iCloud database. See PatreonAccount.
///
/// One row at most. A removed token is kept as a row with `token == nil`
/// rather than deleted: the removal has to win against an older copy on the
/// other device, and a missing row has no timestamp to win with.
@Model
final class PatreonCredential {
    @Attribute(.unique) var key: String = PatreonCredential.singletonKey
    var token: String?
    /// When this device last set or cleared it — the later change wins.
    var updatedAt: Date = Date.distantPast
    /// The iCloud record's system fields. See `Show.cloudRecordData`.
    var cloudRecordData: Data?

    static let singletonKey = "patreon"

    init() {}
}

/// Listening state that arrived from iCloud for a show or episode this
/// device hasn't got yet.
///
/// A new install asks the API for the catalogue and iCloud for its history
/// at the same time, and iCloud usually wins — so without somewhere to put
/// them, a device's entire listening history would land seconds before the
/// rows it belongs to and be dropped. SyncEngine empties this table each
/// time it inserts episodes.
///
/// `key` is "episode:<guid>" or "show:<slug>"; only the fields that key's
/// kind uses are meaningful.
@Model
final class PendingListeningState {
    @Attribute(.unique) var key: String

    var isPlayed: Bool = false
    var positionSeconds: TimeInterval = 0
    var isStarred: Bool = false

    /// When the device that sent this made the change — carried through so
    /// applying it later still loses to anything newer done here meanwhile.
    var updatedAt: Date = Date.distantPast

    /// The record's system fields, handed to the row when this is applied,
    /// so the first save from this device carries the right change tag.
    var cloudRecordData: Data?

    init(key: String) {
        self.key = key
    }
}
