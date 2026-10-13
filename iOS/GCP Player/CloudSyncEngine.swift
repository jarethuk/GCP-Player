//
//  CloudSyncEngine.swift
//  GCP Player
//
//  Carries what you've listened to between your devices, through your own
//  iCloud account. SyncEngine.swift brings the *catalogue* down from the
//  API; this brings the three things the API has never heard of — whether
//  an episode is played, where you had got to in it, and which shows are
//  starred — across to the other phone, and back after a restore.
//
//  It is built on CKSyncEngine, CloudKit's own sync engine: it owns the
//  scheduling, the batching, the retries and backoff, the database
//  subscription and the silent pushes that wake us when another device
//  writes. What is left for us is the part only this app can know — what a
//  record looks like, and who wins when two devices disagree.
//
//  Four rules shape this file, and the awkward cases all come back to one
//  of them:
//
//  1. **Only listening state goes up** — and the one setting that belongs
//     with it, the user's Patreon token, as an encrypted field. No catalogue: the API serves that
//     to every device already, and pushing 1,279 episodes through someone's
//     iCloud to say what a free endpoint says would be rude. No downloads
//     either — the audio can't cross, and `downloadFileName` names a file
//     that exists on one device only.
//  2. **The later change wins**, measured by a stamp this app keeps
//     (`Episode.stateUpdatedAt`, `Show.starredUpdatedAt`) rather than by
//     CloudKit's own modification date, which says when a *record* was
//     written and not when the user did anything. A device that loses
//     re-sends its copy, so the disagreement ends instead of ping-ponging.
//  3. **The device that is playing wins.** A record arriving for the
//     episode in the player is never applied: nothing moves the playhead
//     under a listener. Our position goes up instead.
//  4. **State can arrive before the rows it belongs to.** A new install
//     asks iCloud and the API at the same time and iCloud usually answers
//     first, so an orphan is parked in `PendingListeningState` and applied
//     by SyncEngine once the episode exists. Dropping it would silently
//     cost someone their whole history on the device they most wanted it on.
//
//  Note that a Simulator cannot receive the silent pushes, so changes land
//  there only when the app foregrounds and asks. On a device it is seconds.
//

import CloudKit
import CryptoKit
import Foundation
import OSLog
import SwiftData

private let log = Logger(subsystem: "bencreswell.gcpplayer", category: "cloudsync")

@MainActor
@Observable
final class CloudSyncEngine: CKSyncEngineDelegate {
    static let shared = CloudSyncEngine()

    /// Must match `com.apple.developer.icloud-container-identifiers` in the
    /// entitlements, or nothing syncs and CloudKit says only that the
    /// container is unknown.
    private static let containerIdentifier = "iCloud.bencreswell.gcpplayer"

    /// One custom zone holds the lot. Custom rather than the default zone
    /// because a zone can be fetched, and thrown away, whole — which is
    /// what "Clear Data and Resync" leans on.
    private static let zoneID = CKRecordZone.ID(zoneName: "ListeningState", ownerName: CKCurrentUserDefaultName)

    private enum RecordType {
        static let episode = "EpisodeState"
        static let show = "ShowState"
        static let patreon = "PatreonCredential"
    }

    /// There is only ever one.
    private static let patreonRecordName = "patreon-credential"

    /// CloudKit has no boolean type, so the flags travel as 0/1 Int64s.
    private enum Field {
        static let guid = "guid"
        static let slug = "slug"
        static let isPlayed = "isPlayed"
        static let positionSeconds = "positionSeconds"
        static let isStarred = "isStarred"
        static let updatedAt = "updatedAt"
        /// In `encryptedValues`, never in the clear: it opens someone's
        /// Patreon feed. Empty means removed — see PatreonCredential.
        static let token = "token"
    }

    private enum DefaultsKey {
        static let user = "cloudSyncAccountUser"
        static let zoneCreated = "cloudSyncZoneCreated"
        static let seeded = "cloudSyncSeededExistingState"
    }

    /// A record is about 200 bytes and an upload batch may be 1 MB, so this
    /// is well inside the limit — it exists to keep one first-launch push
    /// of a whole listening history from being a single enormous request.
    private static let batchLimit = 300

    /// How often a *position* is allowed up while playback continues. The
    /// player writes the position to the database every five seconds; this
    /// is the rate the other devices hear about it at, and pausing,
    /// scrubbing, finishing or backgrounding bypasses it entirely. See
    /// `Episode.updatePosition(_:flush:)`.
    private static let positionInterval: TimeInterval = 120

    // MARK: - What the screens watch

    /// Bumped when a fetch actually changed something here. ShowsView and
    /// the CarPlay scene cache counts that no query would refresh, so this
    /// is their cue to recount.
    private(set) var lastImportedAt: Date?

    /// When this device last got its own changes up — records CloudKit
    /// actually saved, not merely a send that finished.
    private(set) var lastSentAt: Date?

    /// Why iCloud is refusing this device's changes, while it is. Set by a
    /// failure the engine won't retry its way out of — a record type missing
    /// from the production schema, a full iCloud — and cleared by the next
    /// send that gets through cleanly. Network trouble never sets it: the
    /// engine backs off and tries again on its own. Without this, a device
    /// whose every save bounced would go on saying it had just synced.
    private(set) var sendError: CKError?

    /// Whether there is an iCloud account to sync with. `.couldNotDetermine`
    /// until the first answer comes back.
    private(set) var accountStatus: CKAccountStatus = .couldNotDetermine

    // MARK: - Private state

    private var syncEngine: CKSyncEngine?
    private var modelContainer: ModelContainer?
    private var context: ModelContext? { modelContainer?.mainContext }

    /// Record name → episode guid. A record name is a hash (see
    /// `recordName(forEpisodeGuid:)`), so this is the only way back; it is
    /// filled as changes are queued and rebuilt from the database when a
    /// name arrives that this launch hasn't seen.
    private var guidsByRecordName: [String: String] = [:]
    private var hasRebuiltIndex = false

    /// Last time each record's position was sent, for the rate above.
    private var lastPositionPush: [String: Date] = [:]

    /// Set while applying a fetch, so `didFetchChanges` only bumps
    /// `lastImportedAt` when something really moved.
    private var importChangedSomething = false

    // MARK: - Starting up

    func start(container: ModelContainer) {
        guard syncEngine == nil else { return }
        modelContainer = container

        seedExistingState()

        let cloudContainer = CKContainer(identifier: Self.containerIdentifier)
        let configuration = CKSyncEngine.Configuration(
            database: cloudContainer.privateCloudDatabase,
            stateSerialization: Self.loadState(),
            delegate: self
        )
        syncEngine = CKSyncEngine(configuration)
        log.info("sync engine started")

        requeueUnsent()

        Task {
            let status = try? await cloudContainer.accountStatus()
            accountStatus = status ?? .couldNotDetermine
        }
    }

    /// Everything this device had already played, half-played or starred
    /// before this feature existed, stamped so it has something to sync.
    ///
    /// Stamped `seedStamp` rather than "now" on purpose: the second device
    /// to be updated would otherwise claim its months-old state was the
    /// newest thing either device had and overwrite the first. Two devices
    /// carrying the same seed stamp are treated as a tie, and a tie merges
    /// rather than picks — see `merge(into:)`.
    ///
    /// Only stamps. `requeueUnsent`, which runs once the engine exists,
    /// is what offers them to iCloud.
    private func seedExistingState() {
        guard let context, !UserDefaults.standard.bool(forKey: DefaultsKey.seeded) else { return }
        UserDefaults.standard.set(true, forKey: DefaultsKey.seeded)

        let played = FetchDescriptor<Episode>(
            predicate: #Predicate { $0.stateUpdatedAt == nil && ($0.isPlayed || $0.positionSeconds > 0) }
        )
        let episodes = (try? context.fetch(played)) ?? []
        for episode in episodes {
            episode.stateUpdatedAt = Self.seedStamp
        }

        let starred = FetchDescriptor<Show>(predicate: #Predicate { $0.starredUpdatedAt == nil && $0.isStarred })
        let shows = (try? context.fetch(starred)) ?? []
        for show in shows {
            show.starredUpdatedAt = Self.seedStamp
        }

        guard !episodes.isEmpty || !shows.isEmpty else { return }
        try? context.save()
        log.info("seeded \(episodes.count) episodes and \(shows.count) shows from before iCloud sync")
    }

    /// The stamp on state from before sync existed: older than any real
    /// change, and the same on every device, so two seeds tie. An ordinary
    /// date — 1 January 2001 — rather than `.distantPast`, whose year 1 is
    /// not something to trust a server with.
    private static let seedStamp = Date(timeIntervalSinceReferenceDate: 0)

    /// Offers iCloud everything this device has stamped but iCloud has never
    /// confirmed — every row with a stamp and no change tag. Run at every
    /// launch.
    ///
    /// A save that fails for good is dropped by the engine, and nothing else
    /// would ever offer it again. That is how a device's whole history could
    /// sit unsynced: the seed was queued once, at the first launch, and
    /// failed. The same goes for a zone deleted elsewhere, which clears every
    /// change tag. Queueing is cheap and a row that did get up is skipped, so
    /// once the history is up this finds nothing.
    private func requeueUnsent() {
        guard let context else { return }

        // Seeds written as `.distantPast` by earlier builds. Rewritten so the
        // records go up with the stamp every device now agrees on.
        let distantPast = Date.distantPast
        let oldEpisodeSeeds = FetchDescriptor<Episode>(predicate: #Predicate { $0.stateUpdatedAt == distantPast })
        for episode in (try? context.fetch(oldEpisodeSeeds)) ?? [] {
            episode.stateUpdatedAt = Self.seedStamp
        }
        let oldShowSeeds = FetchDescriptor<Show>(predicate: #Predicate { $0.starredUpdatedAt == distantPast })
        for show in (try? context.fetch(oldShowSeeds)) ?? [] {
            show.starredUpdatedAt = Self.seedStamp
        }
        try? context.save()

        let episodes = FetchDescriptor<Episode>(
            predicate: #Predicate { $0.stateUpdatedAt != nil && $0.cloudRecordData == nil }
        )
        let unsentEpisodes = (try? context.fetch(episodes)) ?? []
        for episode in unsentEpisodes { enqueue(episode) }

        let shows = FetchDescriptor<Show>(
            predicate: #Predicate { $0.starredUpdatedAt != nil && $0.cloudRecordData == nil }
        )
        let unsentShows = (try? context.fetch(shows)) ?? []
        for show in unsentShows { enqueue(show) }

        if let credential = PatreonAccount.shared.credential(), credential.cloudRecordData == nil {
            enqueuePatreonCredential()
        }

        if !unsentEpisodes.isEmpty || !unsentShows.isEmpty {
            log.info("queued \(unsentEpisodes.count) episodes and \(unsentShows.count) shows iCloud has never confirmed")
        }
    }

    // MARK: - Offering a change to iCloud

    /// Queues an episode's listening state. `flush: false` is the player's
    /// five-second tick, which is rate-limited to `positionInterval`;
    /// everything else goes now.
    func enqueue(_ episode: Episode, flush: Bool = true) {
        let name = Self.recordName(forEpisodeGuid: episode.guid)
        guidsByRecordName[name] = episode.guid

        if !flush, let last = lastPositionPush[name], Date.now.timeIntervalSince(last) < Self.positionInterval {
            return
        }
        lastPositionPush[name] = .now
        enqueue(recordNamed: name)
    }

    func enqueue(_ show: Show) {
        enqueue(recordNamed: Self.recordName(forShowSlug: show.slug))
    }

    func enqueuePatreonCredential() {
        enqueue(recordNamed: Self.patreonRecordName)
    }

    private func enqueue(recordNamed name: String) {
        guard let syncEngine else { return }
        // The zone has to exist before anything can go in it, and asking
        // for it again once it does would be a wasted round trip on every
        // single change — so it is asked for until the server confirms it.
        if !UserDefaults.standard.bool(forKey: DefaultsKey.zoneCreated) {
            syncEngine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zoneID))])
        }
        syncEngine.state.add(pendingRecordZoneChanges: [
            .saveRecord(CKRecord.ID(recordName: name, zoneID: Self.zoneID))
        ])
    }

    /// Ask for anything waiting. Called when the app comes forward — the
    /// engine also does this on its own schedule and on a push, but a push
    /// never arrives on a Simulator and a phone that was offline has some
    /// catching up to do.
    func fetchChanges() {
        guard let syncEngine else { return }
        Task { try? await syncEngine.fetchChanges() }
    }

    /// Push what's queued. Called as the app goes to the background, which
    /// is exactly when someone is about to pick up the other device.
    func sendPendingChanges() {
        guard let syncEngine else { return }
        Task { try? await syncEngine.sendChanges() }
    }

    // MARK: - CKSyncEngineDelegate

    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        switch event {
        case .stateUpdate(let update):
            // Written straight to disk: this is the checkpoint a crash
            // mid-sync resumes from, and it is only worth anything if it is
            // newer than the work it describes.
            Self.saveState(update.stateSerialization)

        case .accountChange(let change):
            handleAccountChange(change, syncEngine: syncEngine)

        case .fetchedRecordZoneChanges(let changes):
            for modification in changes.modifications {
                apply(modification.record)
            }
            // A deleted record means the other device wiped its copy, not
            // that the episode was unplayed — there is nothing to apply.

        case .sentRecordZoneChanges(let sent):
            handleSentChanges(sent, syncEngine: syncEngine)

        case .sentDatabaseChanges(let sent):
            if sent.savedZones.contains(where: { $0.zoneID == Self.zoneID }) {
                UserDefaults.standard.set(true, forKey: DefaultsKey.zoneCreated)
            }
            for failure in sent.failedZoneSaves where !Self.isTransient(failure.error.code) {
                log.error("zone save failed: \(failure.error, privacy: .public)")
                sendError = failure.error
            }

        case .fetchedDatabaseChanges(let changes):
            // The zone went away — iCloud reset, or another device wiped
            // it. Every change tag we hold describes records that no longer
            // exist, so let go of them before we try to save against one.
            if changes.deletions.contains(where: { $0.zoneID == Self.zoneID }) {
                log.notice("the listening-state zone was deleted elsewhere")
                UserDefaults.standard.set(false, forKey: DefaultsKey.zoneCreated)
                forgetCloudRecords()
            }

        case .didFetchChanges:
            if importChangedSomething {
                importChangedSomething = false
                try? context?.save()
                lastImportedAt = .now
            }

        default:
            break
        }
    }

    func nextRecordZoneChangeBatch(
        _ context: CKSyncEngine.SendChangesContext,
        syncEngine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let pending = syncEngine.state.pendingRecordZoneChanges.filter { context.options.scope.contains($0) }
        guard !pending.isEmpty else { return nil }

        var records: [CKRecord] = []
        var unbacked: [CKSyncEngine.PendingRecordZoneChange] = []

        for change in pending {
            guard records.count < Self.batchLimit else { break }
            guard case .saveRecord(let id) = change else { continue }
            if let record = makeRecord(for: id) {
                records.append(record)
            } else {
                // The row is gone — an episode the API tombstoned, say.
                // Dropping the change is the whole handling: the record can
                // stay in iCloud for the devices that still have the row.
                unbacked.append(change)
            }
        }

        if !unbacked.isEmpty {
            syncEngine.state.remove(pendingRecordZoneChanges: unbacked)
        }
        guard !records.isEmpty else { return nil }
        return CKSyncEngine.RecordZoneChangeBatch(recordsToSave: records, recordIDsToDelete: [])
    }

    // MARK: - Building a record

    private func makeRecord(for id: CKRecord.ID) -> CKRecord? {
        if id.recordName == Self.patreonRecordName {
            guard let credential = PatreonAccount.shared.credential() else { return nil }
            let record = Self.record(from: credential.cloudRecordData)
                ?? CKRecord(recordType: RecordType.patreon, recordID: id)
            record.encryptedValues[Field.token] = credential.token ?? ""
            record[Field.updatedAt] = credential.updatedAt
            return record
        }

        if let slug = Self.showSlug(forRecordName: id.recordName) {
            guard let show = show(withSlug: slug) else { return nil }
            let record = Self.record(from: show.cloudRecordData)
                ?? CKRecord(recordType: RecordType.show, recordID: id)
            record[Field.slug] = slug
            record[Field.isStarred] = show.isStarred ? 1 : 0
            record[Field.updatedAt] = show.starredUpdatedAt ?? .now
            return record
        }

        guard let guid = episodeGuid(forRecordName: id.recordName),
              let episode = episode(withGuid: guid)
        else { return nil }

        let record = Self.record(from: episode.cloudRecordData)
            ?? CKRecord(recordType: RecordType.episode, recordID: id)
        record[Field.guid] = guid
        record[Field.isPlayed] = episode.isPlayed ? 1 : 0
        record[Field.positionSeconds] = episode.positionSeconds
        record[Field.updatedAt] = episode.stateUpdatedAt ?? .now
        return record
    }

    // MARK: - Applying a record

    private func apply(_ record: CKRecord) {
        switch record.recordType {
        case RecordType.episode: applyEpisode(record)
        case RecordType.show: applyShow(record)
        case RecordType.patreon: applyPatreon(record)
        default: log.error("unknown record type \(record.recordType, privacy: .public)")
        }
    }

    private func applyEpisode(_ record: CKRecord) {
        guard let guid = record[Field.guid] as? String else { return }
        let updatedAt = record[Field.updatedAt] as? Date ?? .distantPast
        let isPlayed = (record[Field.isPlayed] as? Int ?? 0) != 0
        let position = record[Field.positionSeconds] as? Double ?? 0

        guidsByRecordName[record.recordID.recordName] = guid

        guard let episode = episode(withGuid: guid) else {
            park(key: "episode:" + guid, updatedAt: updatedAt, record: record) { parked in
                parked.isPlayed = isPlayed
                parked.positionSeconds = position
            }
            return
        }

        episode.cloudRecordData = Self.systemFields(of: record)
        merge(into: episode, isPlayed: isPlayed, positionSeconds: position, updatedAt: updatedAt)
    }

    private func applyShow(_ record: CKRecord) {
        guard let slug = record[Field.slug] as? String else { return }
        let updatedAt = record[Field.updatedAt] as? Date ?? .distantPast
        let isStarred = (record[Field.isStarred] as? Int ?? 0) != 0

        guard let show = show(withSlug: slug) else {
            park(key: "show:" + slug, updatedAt: updatedAt, record: record) { parked in
                parked.isStarred = isStarred
            }
            return
        }

        show.cloudRecordData = Self.systemFields(of: record)
        merge(into: show, isStarred: isStarred, updatedAt: updatedAt)
    }

    /// The later token wins, like everything else. No parking: the row is
    /// this device's own, so there is always somewhere to put it.
    private func applyPatreon(_ record: CKRecord) {
        guard let context else { return }
        let updatedAt = record[Field.updatedAt] as? Date ?? .distantPast
        let token = (record.encryptedValues[Field.token] as? String).flatMap { $0.isEmpty ? nil : $0 }

        let credential = PatreonAccount.shared.credential() ?? {
            let created = PatreonCredential()
            context.insert(created)
            return created
        }()
        credential.cloudRecordData = Self.systemFields(of: record)

        if credential.updatedAt > updatedAt {
            enqueuePatreonCredential()
            return
        }
        guard credential.updatedAt < updatedAt || credential.token != token else { return }

        credential.token = token
        credential.updatedAt = updatedAt
        try? context.save()
        PatreonAccount.shared.reload()
        importChangedSomething = true
    }

    /// Rule 2 and rule 3, for one episode.
    private func merge(into episode: Episode, isPlayed: Bool, positionSeconds: Double, updatedAt: Date) {
        // Rule 3: nothing touches what is playing.
        if PlayerModel.shared.currentEpisode?.guid == episode.guid {
            enqueue(episode)
            return
        }

        let local = episode.stateUpdatedAt ?? .distantPast

        if local > updatedAt {
            // Ours is the newer one. Say so, rather than leave the other
            // device believing something this one disagreed with.
            enqueue(episode)
            return
        }

        let played: Bool
        let position: TimeInterval
        if local == updatedAt {
            // A tie is two devices carrying the same seed stamp from before
            // any of this existed (see seedExistingState). Neither claim is
            // better than the other, so take the more advanced of the two
            // rather than a coin toss: heard beats unheard, and further in
            // beats nearer the start.
            played = episode.isPlayed || isPlayed
            position = max(episode.positionSeconds, positionSeconds)
        } else {
            played = isPlayed
            position = positionSeconds
            episode.stateUpdatedAt = updatedAt
        }

        let changed = played != episode.isPlayed || position != episode.positionSeconds
        episode.isPlayed = played
        episode.positionSeconds = played ? 0 : position
        if changed {
            importChangedSomething = true
            // Marking played frees the file here too — keeping 80 MB of
            // audio you have already heard on the other device is exactly
            // what the sweep exists to avoid.
            if played { DownloadManager.shared.removeDownload(for: episode) }
            if local == updatedAt { enqueue(episode) }
        }
    }

    private func merge(into show: Show, isStarred: Bool, updatedAt: Date) {
        let local = show.starredUpdatedAt ?? .distantPast

        if local > updatedAt {
            enqueue(show)
            return
        }

        let starred: Bool
        if local == updatedAt {
            starred = show.isStarred || isStarred
        } else {
            starred = isStarred
            show.starredUpdatedAt = updatedAt
        }

        guard starred != show.isStarred else { return }
        show.isStarred = starred
        importChangedSomething = true
        if local == updatedAt { enqueue(show) }
    }

    /// Rule 4: keeps a record whose row hasn't arrived yet.
    private func park(
        key: String,
        updatedAt: Date,
        record: CKRecord,
        fill: (PendingListeningState) -> Void
    ) {
        guard let context else { return }

        var descriptor = FetchDescriptor<PendingListeningState>(predicate: #Predicate { $0.key == key })
        descriptor.fetchLimit = 1
        let existing = try? context.fetch(descriptor).first

        let parked: PendingListeningState
        if let existing {
            guard existing.updatedAt <= updatedAt else { return }
            parked = existing
        } else {
            parked = PendingListeningState(key: key)
            context.insert(parked)
        }

        fill(parked)
        parked.updatedAt = updatedAt
        parked.cloudRecordData = Self.systemFields(of: record)
        try? context.save()
    }

    /// Applies everything parked whose row has since arrived, and forgets
    /// it. Called by SyncEngine at the end of a catalogue sync — that is
    /// the moment new episodes exist.
    @discardableResult
    func applyParkedState(in context: ModelContext) -> Int {
        let parked = (try? context.fetch(FetchDescriptor<PendingListeningState>())) ?? []
        guard !parked.isEmpty else { return 0 }

        var applied = 0
        for row in parked {
            if let guid = row.key.after("episode:") {
                guard let episode = episode(withGuid: guid) else { continue }
                episode.cloudRecordData = row.cloudRecordData
                merge(
                    into: episode,
                    isPlayed: row.isPlayed,
                    positionSeconds: row.positionSeconds,
                    updatedAt: row.updatedAt
                )
            } else if let slug = row.key.after("show:") {
                guard let show = show(withSlug: slug) else { continue }
                show.cloudRecordData = row.cloudRecordData
                merge(into: show, isStarred: row.isStarred, updatedAt: row.updatedAt)
            }
            context.delete(row)
            applied += 1
        }

        if applied > 0 {
            importChangedSomething = false
            try? context.save()
            lastImportedAt = .now
            log.info("applied \(applied) parked listening-state records")
        }
        return applied
    }

    // MARK: - What came back from a send

    private func handleSentChanges(_ sent: CKSyncEngine.Event.SentRecordZoneChanges, syncEngine: CKSyncEngine) {
        for record in sent.savedRecords {
            remember(record)
        }

        var retry: [CKSyncEngine.PendingRecordZoneChange] = []
        var refused: CKError?
        for failure in sent.failedRecordSaves {
            let id = failure.record.recordID
            switch failure.error.code {
            case .serverRecordChanged:
                // Another device saved first. Their copy carries the change
                // tag ours was missing, so merging it in both settles the
                // disagreement and unblocks the next save — and if ours was
                // the newer one, the merge queues it again itself.
                if let serverRecord = failure.error.serverRecord {
                    apply(serverRecord)
                }

            case .zoneNotFound:
                UserDefaults.standard.set(false, forKey: DefaultsKey.zoneCreated)
                syncEngine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zoneID))])
                forgetCloudRecords()
                retry.append(.saveRecord(id))

            case .unknownItem:
                // The record was deleted out from under us; our change tag
                // describes something gone. Send it as a new record.
                forgetCloudRecord(named: id.recordName)
                retry.append(.saveRecord(id))

            case .batchRequestFailed:
                // Collateral: another record in the same batch failed, and
                // that one carries the reason. This goes again with the rest.
                break

            case let code where Self.isTransient(code):
                // The engine's own backoff handles these; it keeps the
                // pending change and comes back to it.
                break

            default:
                log.error("save failed for \(id.recordName, privacy: .public): \(failure.error, privacy: .public)")
                refused = failure.error
            }
        }

        if !sent.savedRecords.isEmpty {
            lastSentAt = .now
        }
        if let refused {
            sendError = refused
        } else if !sent.savedRecords.isEmpty {
            sendError = nil
        }

        if !retry.isEmpty {
            syncEngine.state.add(pendingRecordZoneChanges: retry)
        }
        if !sent.savedRecords.isEmpty {
            try? context?.save()
        }
    }

    /// Failures that say nothing about whether a save *can* succeed, only
    /// that it didn't this time.
    private static func isTransient(_ code: CKError.Code) -> Bool {
        switch code {
        case .networkFailure, .networkUnavailable, .serviceUnavailable, .requestRateLimited, .zoneBusy:
            return true
        default:
            return false
        }
    }

    // MARK: - Accounts

    private func handleAccountChange(_ change: CKSyncEngine.Event.AccountChange, syncEngine: CKSyncEngine) {
        let defaults = UserDefaults.standard

        // Also the only word we get about an account appearing or going
        // away while the app is open — the status is otherwise read once,
        // at launch, and Settings would go on claiming the old one.
        accountStatus = change.changeType.isSignOut ? .noAccount : .available

        switch change.changeType {
        case .signIn(let user):
            let previous = defaults.string(forKey: DefaultsKey.user)
            defaults.set(user.recordName, forKey: DefaultsKey.user)
            if previous == nil || previous == user.recordName {
                // Turning iCloud on brings this device's history with it.
                uploadEverythingLocal()
            } else {
                startFresh(syncEngine)
            }

        case .signOut:
            // What is here stays: this device produced it, and deleting
            // someone's listening history because they signed out of iCloud
            // would be a worse surprise than it not syncing. Only the
            // syncing stops.
            defaults.removeObject(forKey: DefaultsKey.user)
            sendError = nil

        case .switchAccounts(_, let current):
            // A different person, possibly a device that changed hands.
            // Nothing already here goes up to them; we only listen.
            defaults.set(current.recordName, forKey: DefaultsKey.user)
            startFresh(syncEngine)

        @unknown default:
            break
        }
    }

    private func startFresh(_ syncEngine: CKSyncEngine) {
        syncEngine.state.remove(pendingRecordZoneChanges: syncEngine.state.pendingRecordZoneChanges)
        syncEngine.state.remove(pendingDatabaseChanges: syncEngine.state.pendingDatabaseChanges)
        UserDefaults.standard.set(false, forKey: DefaultsKey.zoneCreated)
        lastPositionPush = [:]
        sendError = nil
        forgetCloudRecords()
        Task { try? await syncEngine.fetchChanges() }
    }

    private func uploadEverythingLocal() {
        guard let context else { return }

        let stamped = FetchDescriptor<Episode>(predicate: #Predicate { $0.stateUpdatedAt != nil })
        for episode in (try? context.fetch(stamped)) ?? [] {
            enqueue(episode)
        }
        let starred = FetchDescriptor<Show>(predicate: #Predicate { $0.starredUpdatedAt != nil })
        for show in (try? context.fetch(starred)) ?? [] {
            enqueue(show)
        }
        if PatreonAccount.shared.credential() != nil {
            enqueuePatreonCredential()
        }
    }

    // MARK: - After the local copy is thrown away

    /// Rebuilds the engine from nothing and asks for the whole zone again.
    ///
    /// "Clear Data and Resync" deletes every row, and with them every change
    /// tag and every trace of what had already been fetched. An engine still
    /// holding its server tokens would ask what changed *since* a catalogue
    /// that is no longer here and be told, correctly, nothing — leaving the
    /// history stranded in iCloud. Starting over is what brings it back.
    @discardableResult
    func restoreAfterLocalWipe(in context: ModelContext) async -> Int {
        Self.discardState()
        UserDefaults.standard.set(false, forKey: DefaultsKey.zoneCreated)
        guidsByRecordName = [:]
        lastPositionPush = [:]
        hasRebuiltIndex = false
        syncEngine = nil

        guard let modelContainer else { return 0 }
        start(container: modelContainer)
        try? await syncEngine?.fetchChanges()
        // Anything the fetch couldn't place — the catalogue is back by now,
        // so in practice this is empty and the records went straight on.
        return applyParkedState(in: context)
    }

    // MARK: - Record names

    /// Feed guids are URLs, and a CloudKit record name may not hold a
    /// slash — so the name is a hash of the guid and the guid itself
    /// travels as a field. Show slugs are already safe, and staying
    /// readable in the CloudKit console is worth something when 32 rows are
    /// all you are looking at.
    private static func recordName(forEpisodeGuid guid: String) -> String {
        let digest = SHA256.hash(data: Data(guid.utf8))
        return "episode-" + digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func recordName(forShowSlug slug: String) -> String {
        "show-" + slug
    }

    private static func showSlug(forRecordName name: String) -> String? {
        name.after("show-")
    }

    /// The way back from a hashed name. Rebuilt from the database once per
    /// launch when a name turns up that hasn't been queued this time round
    /// — which is what happens to changes that were still pending when the
    /// app was last closed.
    private func episodeGuid(forRecordName name: String) -> String? {
        if let guid = guidsByRecordName[name] { return guid }
        guard !hasRebuiltIndex, let context else { return nil }
        hasRebuiltIndex = true

        let stamped = FetchDescriptor<Episode>(predicate: #Predicate { $0.stateUpdatedAt != nil })
        for episode in (try? context.fetch(stamped)) ?? [] {
            guidsByRecordName[Self.recordName(forEpisodeGuid: episode.guid)] = episode.guid
        }
        return guidsByRecordName[name]
    }

    // MARK: - Rows

    private func episode(withGuid guid: String) -> Episode? {
        guard let context else { return nil }
        var descriptor = FetchDescriptor<Episode>(predicate: #Predicate { $0.guid == guid })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func show(withSlug slug: String) -> Show? {
        guard let context else { return nil }
        var descriptor = FetchDescriptor<Show>(predicate: #Predicate { $0.slug == slug })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    // MARK: - Change tags

    private func remember(_ record: CKRecord) {
        let data = Self.systemFields(of: record)
        if record.recordID.recordName == Self.patreonRecordName {
            PatreonAccount.shared.credential()?.cloudRecordData = data
        } else if let slug = Self.showSlug(forRecordName: record.recordID.recordName) {
            show(withSlug: slug)?.cloudRecordData = data
        } else if let guid = episodeGuid(forRecordName: record.recordID.recordName) {
            episode(withGuid: guid)?.cloudRecordData = data
        }
    }

    private func forgetCloudRecord(named name: String) {
        if name == Self.patreonRecordName {
            PatreonAccount.shared.credential()?.cloudRecordData = nil
        } else if let slug = Self.showSlug(forRecordName: name) {
            show(withSlug: slug)?.cloudRecordData = nil
        } else if let guid = episodeGuid(forRecordName: name) {
            episode(withGuid: guid)?.cloudRecordData = nil
        }
    }

    /// Drops every change tag we hold. Used when the records they describe
    /// have gone — a deleted zone, or a different account.
    private func forgetCloudRecords() {
        guard let context else { return }
        let episodes = FetchDescriptor<Episode>(predicate: #Predicate { $0.cloudRecordData != nil })
        for episode in (try? context.fetch(episodes)) ?? [] {
            episode.cloudRecordData = nil
        }
        let shows = FetchDescriptor<Show>(predicate: #Predicate { $0.cloudRecordData != nil })
        for show in (try? context.fetch(shows)) ?? [] {
            show.cloudRecordData = nil
        }
        PatreonAccount.shared.credential()?.cloudRecordData = nil
        try? context.save()
    }

    /// A record's identity and change tag, without its values — what
    /// CloudKit needs back on the next save to tell an edit from a clash.
    private static func systemFields(of record: CKRecord) -> Data {
        let coder = NSKeyedArchiver(requiringSecureCoding: true)
        record.encodeSystemFields(with: coder)
        coder.finishEncoding()
        return coder.encodedData
    }

    private static func record(from data: Data?) -> CKRecord? {
        guard let data, let coder = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
        coder.requiresSecureCoding = true
        defer { coder.finishDecoding() }
        return CKRecord(coder: coder)
    }

    // MARK: - The engine's own state

    /// Application Support, beside the downloads, for the same reason: the
    /// system empties Caches under pressure, and losing this turns the next
    /// launch into a full re-fetch of everything.
    private static let stateURL: URL = {
        #if os(tvOS)
        // Beside the store, so a purge of one is a purge of both — see
        // AppDatabase.tvStoreDirectory.
        return AppDatabase.tvStoreDirectory.appending(path: "cloud-sync-state.json")
        #else
        let base = (try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )) ?? URL.temporaryDirectory
        return base.appending(path: "cloud-sync-state.json")
        #endif
    }()

    private static func loadState() -> CKSyncEngine.State.Serialization? {
        guard let data = try? Data(contentsOf: stateURL) else { return nil }
        return try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: data)
    }

    private static func saveState(_ state: CKSyncEngine.State.Serialization) {
        guard let data = try? JSONEncoder().encode(state) else {
            log.error("could not encode the sync engine's state")
            return
        }
        try? data.write(to: stateURL, options: .atomic)
    }

    private static func discardState() {
        try? FileManager.default.removeItem(at: stateURL)
    }
}

private extension CKSyncEngine.Event.AccountChange.ChangeType {
    var isSignOut: Bool {
        if case .signOut = self { return true }
        return false
    }
}

private extension String {
    /// The rest of the string after `prefix`, or nil if it doesn't start
    /// with it. Record names and parked keys are both prefix-tagged.
    func after(_ prefix: String) -> String? {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : nil
    }
}
