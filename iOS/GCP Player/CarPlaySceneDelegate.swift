//
//  CarPlaySceneDelegate.swift
//  GCP Player
//
//  Drives the CarPlay screen. CarPlay apps don't draw custom UI — they
//  assemble system-provided *templates* (lists, grids, now-playing) via an
//  interface controller. iOS instantiates this class when the phone
//  connects to a car (or the CarPlay simulator); it's named in the
//  Info.plist scene manifest.
//
//  Note this reads AppDatabase and PlayerModel.shared — the same objects
//  the phone UI uses. CarPlay is just another mirror of the same state.
//

import CarPlay
import OSLog
import SwiftData

private let log = Logger(subsystem: "bencreswell.gcpplayer", category: "carplay")

final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?

    /// The car screen's scale, for sizing artwork. Cars are not phones — this
    /// is read from the scene rather than assumed, and only makes sense once
    /// one is connected.
    private var displayScale: CGFloat = 2

    /// Rows waiting for a cover, collected while the template is built and
    /// flushed once the car has it. A show that is starred appears in both
    /// sections, so the same artwork can be wanted by two rows.
    private var pendingThumbnails: [(item: CPListItem, urlString: String)] = []
    private var outstandingThumbnails = 0

    /// Kept so the list can be handed back to the car once its covers are in.
    private var showsTemplate: CPListTemplate?
    private var showsSections: [CPListSection] = []

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
        let scale = templateApplicationScene.carWindow.traitCollection.displayScale
        displayScale = scale > 0 ? scale : 2

        refreshNowPlayingButtons()
        observeCurrentEpisode()
        observeCloudImports()

        // The list goes up straight away and the covers follow. A driver
        // waiting on thirty image decodes before seeing anything would be a
        // worse trade than a row that gains its cover a moment later.
        let template = makeShowsTemplate()
        showsTemplate = template
        interfaceController.setRootTemplate(template, animated: false) { [weak self] done, error in
            log.info("root template set: \(done), error \(String(describing: error))")
            self?.loadPendingThumbnails()
        }
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        self.interfaceController = nil
    }

    // MARK: - Now playing

    /// "Play next episode", in the car.
    ///
    /// The now-playing screen is a system template: its transport controls
    /// are fixed — play/pause and the two skips, which come from the remote
    /// command centre — and anything else has to go in the button row
    /// underneath. That row is the only place the phone's Play Next Episode
    /// can appear, so this is it.
    ///
    /// Dark on purpose: CarPlay recolours the glyph for the car's own light
    /// or dark appearance, and expects to be given the dark variant.
    private static let nextEpisodeImage: UIImage = {
        let side = min(CPNowPlayingButtonMaximumImageSize.width, CPNowPlayingButtonMaximumImageSize.height)
        let configuration = UIImage.SymbolConfiguration(pointSize: side * 0.55, weight: .semibold)
        return UIImage(systemName: "forward.end.fill", withConfiguration: configuration)
            ?? UIImage()
    }()

    /// Rebuilt rather than mutated: a button's handler closes over nothing
    /// that changes, and the car only redraws the row when it is handed one.
    private func refreshNowPlayingButtons() {
        let button = CPNowPlayingImageButton(image: Self.nextEpisodeImage) { _ in
            PlayerModel.shared.playNext()
        }
        // Dimmed rather than dropped at the end of a show: a control that
        // comes and goes under a driver's thumb is worse than a dead one.
        button.isEnabled = PlayerModel.shared.nextEpisode != nil
        CPNowPlayingTemplate.shared.updateNowPlayingButtons([button])
    }

    /// Keeps the button's enabled state in step with what is playing —
    /// including when the phone, not the car, changed the episode.
    ///
    /// `withObservationTracking` fires once and is done, and it fires
    /// *before* the new value is in place, which is why this re-arms itself
    /// from a hop back to the main actor rather than from the callback.
    private func observeCurrentEpisode() {
        withObservationTracking {
            _ = PlayerModel.shared.currentEpisode
        } onChange: {
            Task { @MainActor [weak self] in
                guard let self, self.interfaceController != nil else { return }
                self.refreshNowPlayingButtons()
                self.observeCurrentEpisode()
            }
        }
    }

    /// Keeps the car's list honest when the change came from the user's
    /// *other* device. One episode played on the iPad moves an unplayed
    /// count here, and these templates are built once at connect and cached
    /// — a row's detail text is fixed when the row is made.
    private func observeCloudImports() {
        withObservationTracking {
            _ = CloudSyncEngine.shared.lastImportedAt
            // A token set or removed locks or unlocks rows.
            _ = PatreonAccount.shared.changedAt
        } onChange: {
            Task { @MainActor [weak self] in
                guard let self, self.interfaceController != nil else { return }
                self.rebuildShowsList()
                self.observeCloudImports()
            }
        }
    }

    /// New rows, with the new counts, handed to the car.
    private func rebuildShowsList() {
        guard let template = showsTemplate else { return }
        pendingThumbnails = []
        let sections = makeShowsSections()
        template.updateSections(sections)
        loadPendingThumbnails()
        log.info("shows list rebuilt after an iCloud import")
    }

    // MARK: - Templates

    private func makeShowsTemplate() -> CPListTemplate {
        CPListTemplate(title: Copy.Shows.title, sections: makeShowsSections())
    }

    private func makeShowsSections() -> [CPListSection] {
        // Same order as the phone's list: most recently published first.
        let descriptor = FetchDescriptor<Show>(sortBy: [SortDescriptor(\.latestEpisodeAt, order: .reverse), SortDescriptor(\.title)])
        let shows = (try? AppDatabase.container.mainContext.fetch(descriptor)) ?? []

        // Starred shows get their own section at the top — in the car you
        // almost always want one of "your" shows.
        let starred = shows.filter(\.isStarred)
        let sections: [CPListSection]
        if starred.isEmpty {
            sections = [CPListSection(items: shows.map(makeShowItem))]
        } else {
            sections = [
                CPListSection(items: starred.map(makeShowItem), header: Copy.Shows.myShows, sectionIndexTitle: nil),
                CPListSection(items: shows.map(makeShowItem), header: Copy.Shows.allShows, sectionIndexTitle: nil),
            ]
        }
        showsSections = sections
        return sections
    }

    private func makeShowItem(for show: Show) -> CPListItem {
        let unplayedCount = show.episodes.count { !$0.isPlayed && !$0.isLocked }
        let detail = unplayedCount > 0 ? Copy.Shows.unplayedCount(unplayedCount) : Copy.Shows.allPlayed
        let item = CPListItem(text: show.title, detailText: detail)
        item.handler = { [weak self] _, completion in
            self?.pushEpisodeList(for: show)
            completion()
        }
        if let artworkUrl = show.artworkUrl {
            pendingThumbnails.append((item, artworkUrl))
        }
        return item
    }

    /// Puts the show's cover on a row once it has been decoded.
    ///
    /// Attached afterwards rather than before the template is built: the car
    /// gets its list immediately and each cover appears as it arrives.
    /// Blocking the template on thirty network fetches would leave the driver
    /// looking at an empty screen, and a car is the worst place for that.
    ///
    /// Goes through the same ArtworkLoader as the phone, so a cover already on
    /// disk costs no network at all — which is the common case, because the
    /// phone has usually been used before it is plugged into a car.
    private func loadPendingThumbnails() {
        let rows = pendingThumbnails
        pendingThumbnails = []
        guard !rows.isEmpty else { return }

        // CarPlay caps how large a row image may be, and works in points.
        let maximum = CPListItem.maximumImageSize
        let scale = displayScale
        let pixels = max(maximum.width, maximum.height) * scale
        log.info("loading \(rows.count) covers at \(pixels)px (max \(maximum.debugDescription), scale \(scale))")

        outstandingThumbnails = rows.count
        for row in rows {
            Task { @MainActor in
                if let image = await ArtworkLoader.image(for: row.urlString, pixelSize: pixels),
                   let bitmap = image.cgImage {
                    // ArtworkLoader deals in pixels and hands back a scale-1
                    // image, so an 88px cover would be laid out as 88 *points*
                    // — twice the size on a car screen. Reapplying the scale is
                    // what sizes it right.
                    row.item.setImage(
                        UIImage(cgImage: bitmap, scale: scale, orientation: image.imageOrientation)
                    )
                } else {
                    log.error("no cover for \(row.urlString, privacy: .public)")
                }

                self.outstandingThumbnails -= 1
                if self.outstandingThumbnails == 0 { self.refreshShowsLayout() }
            }
        }
    }

    /// Hands the same sections back to the car, once every cover is in.
    ///
    /// Setting an image on a row is not enough on its own. A row decides
    /// whether it *has* an image slot when its section is laid out, and the
    /// first section is laid out before any cover has arrived — which is why
    /// the top row came up with its text hard against the margin while every
    /// row below it was fine. Re-handing the sections makes the car lay them
    /// out again, now that each row knows whether it has an image.
    private func refreshShowsLayout() {
        guard let template = showsTemplate, !showsSections.isEmpty else { return }
        template.updateSections(showsSections)
        log.info("sections re-laid out with covers")
    }

    /// "S1 E38 · 42 min".
    ///
    /// The phone puts the numbering in a chip beside the row; a car row has one
    /// line of detail and no chip, so it goes in front of the runtime. Each
    /// part is dropped when it is missing rather than left as an empty gap —
    /// plenty of the network's shows publish no season, and a few no number.
    private static func detail(for episode: Episode) -> String {
        var parts: [String] = []
        if let number = episode.number {
            parts.append(episode.season.map { Copy.Episode.season($0) + " " + Copy.Episode.number(number) } ?? Copy.Episode.number(number))
        }
        if !episode.durationText.isEmpty {
            parts.append(episode.durationText)
        }
        return parts.joined(separator: " · ")
    }

    private func pushEpisodeList(for show: Show) {
        // "Next up" ordering: unplayed episodes, oldest first, so the next
        // episode to listen to is at the top. If everything is played,
        // fall back to the full list.
        //
        // Padlocked episodes are left out: a driver can't be sent to Settings
        // to paste a Patreon link, and a row that does nothing is worse there
        // than anywhere.
        let playable = show.episodes.filter { !$0.isLocked }
        let unplayed = playable.filter { !$0.isPlayed }.sorted { $0.listedAt < $1.listedAt }
        let episodes = unplayed.isEmpty
            ? playable.sorted { $0.listedAt < $1.listedAt }
            : unplayed

        // CarPlay caps how many rows a list may hold.
        let items = episodes.prefix(CPListTemplate.maximumItemCount).map { episode in
            let item = CPListItem(text: episode.title, detailText: Self.detail(for: episode))
            // The small "now playing" bars next to the current episode.
            item.isPlaying = PlayerModel.shared.currentEpisode == episode
            item.handler = { [weak self] _, completion in
                PlayerModel.shared.play(episode)
                // The system's now-playing screen; it renders whatever we
                // put in MPNowPlayingInfoCenter and drives the player via
                // the remote commands — no extra wiring needed here.
                self?.interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
                completion()
            }
            return item
        }

        let template = CPListTemplate(title: show.title, sections: [CPListSection(items: Array(items))])
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }
}
