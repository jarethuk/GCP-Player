//
//  Settings.swift
//  GCP Player
//
//  The user's download preferences, and the screen that edits them.
//
//  Kept in UserDefaults rather than the database: they're about this
//  device, not about the feed, and the player and download manager have to
//  read them outside any view.
//
//  The screen binds through @AppStorage, which persists on change by
//  itself, and the readers below are plain statics — for three booleans
//  that's less machinery than an observable object holding the same values
//  and writing them through.
//

import CloudKit
import SwiftUI
import SwiftData

enum Settings {
    enum Key {
        static let wifiOnly = "downloadOverWiFiOnly"
        static let currentEpisode = "autoDownloadCurrentEpisode"
        static let nextEpisode = "autoDownloadNextEpisode"
    }

    /// All three default on. Registering matters for the non-view readers
    /// below: an unset flag reads as `false` from `bool(forKey:)`, which
    /// would silently turn downloading off until the user visited Settings.
    static func registerDefaults() {
        UserDefaults.standard.register(defaults: [
            Key.wifiOnly: true,
            Key.currentEpisode: true,
            Key.nextEpisode: true,
        ])
    }

    /// An episode is a 50–90 MB file; off by default this is not.
    static var wifiOnly: Bool { UserDefaults.standard.bool(forKey: Key.wifiOnly) }
    static var downloadsCurrentEpisode: Bool { UserDefaults.standard.bool(forKey: Key.currentEpisode) }
    static var downloadsNextEpisode: Bool { UserDefaults.standard.bool(forKey: Key.nextEpisode) }
}

/// The navigation value that pushes the settings page.
///
/// A page rather than a sheet: it is a destination like any other, and a sheet
/// would cover the mini player and give the shows list no `onAppear` to
/// recount against when a reset empties it.
struct SettingsRoute: Hashable {}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var isConfirmingReset = false
    @State private var isResetting = false
    @State private var resetError: String?

    @AppStorage(Settings.Key.wifiOnly) private var wifiOnly = true
    @AppStorage(Settings.Key.currentEpisode) private var downloadsCurrentEpisode = true
    @AppStorage(Settings.Key.nextEpisode) private var downloadsNextEpisode = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                controls
                header

                VStack(spacing: 8) {
                    SettingRow(
                        title: Copy.Settings.wifiOnlyTitle,
                        detail: Copy.Settings.wifiOnlyDetail,
                        isOn: $wifiOnly
                    )
                    SettingRow(
                        title: Copy.Settings.currentEpisodeTitle,
                        detail: Copy.Settings.currentEpisodeDetail,
                        isOn: $downloadsCurrentEpisode
                    )
                    SettingRow(
                        title: Copy.Settings.nextEpisodeTitle,
                        detail: Copy.Settings.nextEpisodeDetail,
                        isOn: $downloadsNextEpisode
                    )
                }
                .padding(.horizontal, 12)

                Text(Copy.Settings.downloadsNote)
                    .font(Theme.body(12, relativeTo: .footnote))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 18)
                    .padding(.top, 18)

                PatreonSettings()
                    .padding(.horizontal, 12)
                    .padding(.top, 26)

                cloudStatus
            }
        }
        .scrollIndicators(.hidden)
        .networkBackground()
        // The page carries its own controls, so an empty bar above them would
        // only push the header down — the same reason the shows list hides it.
        .toolbar(.hidden, for: .navigationBar)
        // Destructive and not undoable, so it asks — and says what goes,
        // because "clear data" doesn't sound like "your downloads too".
        .confirmationDialog(
            Copy.Settings.clearDataConfirmTitle,
            isPresented: $isConfirmingReset,
            titleVisibility: .visible
        ) {
            Button(Copy.Settings.clearDataConfirm, role: .destructive) {
                Task { await clearAndResync() }
            }
            Button(Copy.Common.cancel, role: .cancel) {}
        } message: {
            Text(Copy.Settings.clearDataMessage)
        }
        .alert(
            Copy.Settings.clearDataFailedTitle,
            isPresented: Binding(get: { resetError != nil }, set: { if !$0 { resetError = nil } })
        ) {
            Button(Copy.Common.ok, role: .cancel) { resetError = nil }
        } message: {
            // The local copy is already gone by this point, so say so
            // rather than leave the app looking mysteriously empty.
            Text((resetError ?? "") + "\n\n" + Copy.Settings.clearDataFailedNote)
        }
        .overlay {
            if isResetting {
                ZStack {
                    Theme.ink.opacity(0.8).ignoresSafeArea()
                    VStack(spacing: 14) {
                        ProgressView().tint(Theme.sky)
                        MetaLabel(text: Copy.Settings.clearing, showsTick: false)
                    }
                }
            }
        }
    }

    private func clearAndResync() async {
        isResetting = true
        defer { isResetting = false }
        do {
            let result = try await SyncEngine.clearAndResync(modelContext: modelContext)
            print("[reset] +\(result.episodesCreated) episodes, +\(result.showsCreated) shows")
            dismiss()
        } catch {
            resetError = error.localizedDescription
        }
    }

    /// What iCloud is doing, in a line.
    ///
    /// There are no settings here — syncing is either possible or it isn't,
    /// and a switch for it would only be a way to lose your place on the
    /// other device. But a sync with nothing visible about it is a sync
    /// nobody can tell has stopped.
    private var cloudStatus: some View {
        VStack(alignment: .leading, spacing: 5) {
            MetaLabel(text: Copy.Settings.icloud, showsTick: false, color: Theme.sky)
            Text(cloudStatusText)
                .font(Theme.body(12, relativeTo: .footnote))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.leading)
                .lineSpacing(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.top, 22)
        .padding(.bottom, 28)
    }

    private var cloudStatusText: String {
        let sync = CloudSyncEngine.shared
        switch sync.accountStatus {
        case .available:
            if let error = sync.sendError {
                return error.code == .quotaExceeded
                    ? Copy.Settings.icloudStorageFull
                    : Copy.Settings.icloudSendFailing + " " + Copy.Settings.icloudFailureReason(error.localizedDescription)
            }
            let base = Copy.Settings.icloudSyncing
            guard let at = [sync.lastImportedAt, sync.lastSentAt].compactMap({ $0 }).max() else {
                return base
            }
            return base + " " + Copy.Settings.icloudLastSynced(at.formatted(.relative(presentation: .named)))
        case .noAccount:
            return Copy.Settings.icloudNoAccount
        case .restricted:
            return Copy.Settings.icloudRestricted
        case .temporarilyUnavailable:
            return Copy.Settings.icloudUnavailable
        default:
            return Copy.Settings.icloudChecking
        }
    }

    /// Back and overflow, in the app's own round-icon treatment rather than a
    /// system toolbar — matching the shows list, whose gear sits beside its
    /// header the same way.
    private var controls: some View {
        HStack {
            Button { dismiss() } label: {
                CircleIconLabel(systemImage: "chevron.left")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Copy.Common.back)
            // Leaving mid-wipe would drop you on a list whose rows are being
            // deleted underneath it.
            .disabled(isResetting)

            Spacer(minLength: 0)

            Menu {
                Button(role: .destructive) {
                    isConfirmingReset = true
                } label: {
                    Label(Copy.Settings.clearData, systemImage: "arrow.clockwise")
                }
            } label: {
                CircleIconLabel(systemImage: "ellipsis")
            }
            .accessibilityLabel(Copy.Common.more)
            .disabled(isResetting)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 18)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            MetaLabel(text: Copy.Settings.eyebrow, showsTick: false, color: Theme.sky)
            Text(Copy.Settings.title)
                .font(Theme.display(30, relativeTo: .largeTitle))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
            Capsule()
                .fill(Theme.accentGradient)
                .frame(width: 56, height: 3)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.bottom, 20)
    }
}

/// The Patreon feed link: pasted once, reduced to its token, kept in the
/// database and carried to the user's other devices. See Patreon.swift.
private struct PatreonSettings: View {
    @Environment(\.modelContext) private var modelContext

    @State private var link = ""
    @State private var isChecking = false
    @State private var error: String?
    @State private var isConfirmingRemoval = false

    private var account: PatreonAccount { PatreonAccount.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            MetaLabel(text: Copy.Patreon.label, showsTick: false, color: Theme.sky)
                .padding(.horizontal, 6)

            VStack(alignment: .leading, spacing: 12) {
                if account.hasToken {
                    connected
                } else {
                    entry
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay {
                RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.line, lineWidth: 1)
            }
        }
        .confirmationDialog(
            Copy.Patreon.removeConfirmTitle,
            isPresented: $isConfirmingRemoval,
            titleVisibility: .visible
        ) {
            Button(Copy.Common.remove, role: .destructive) { account.setToken(nil) }
            Button(Copy.Common.cancel, role: .cancel) {}
        } message: {
            Text(Copy.Patreon.removeConfirmMessage)
        }
    }

    private var connected: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Theme.sky)
                Text(Copy.Patreon.connected)
                    .font(Theme.semibold(14, relativeTo: .headline))
                    .foregroundStyle(Theme.bone)
            }
            Text(Copy.Patreon.connectedDetail)
                .font(Theme.body(11.5, relativeTo: .caption))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button(role: .destructive) {
                isConfirmingRemoval = true
            } label: {
                Text(Copy.Patreon.removeLink)
                    .font(Theme.semibold(13, relativeTo: .body))
            }
            .tint(Theme.ember)
        }
    }

    private var entry: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Copy.Patreon.intro)
                .font(Theme.body(11.5, relativeTo: .caption))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)

            PatreonLinkSteps()

            TextField(
                Copy.Patreon.a11yField,
                text: $link,
                // Verbatim: a URL in a localized string is read as Markdown and
                // drawn as a link, in link blue.
                prompt: Text(verbatim: "https://www.patreon.com/rss/…").foregroundStyle(Theme.muted.opacity(0.6))
            )
                .font(Theme.body(13))
                .foregroundStyle(Theme.bone)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                #endif
                .submitLabel(.done)
                .onSubmit { Task { await save() } }
                .padding(10)
                .background(Theme.ink, in: RoundedRectangle(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.line, lineWidth: 1)
                }
                .accessibilityLabel(Copy.Patreon.a11yField)

            if let error {
                Text(error)
                    .font(Theme.body(11.5, relativeTo: .caption))
                    .foregroundStyle(Theme.ember)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // The two side by side, the same size as each other. PasteButton
            // is drawn by the system at its standard size, and ignores a
            // custom font, a control size or a frame — so Save is the one that
            // matches: the same standard size, shape, system font, and an icon
            // beside its title the way Paste has one.
            HStack(spacing: 10) {
                #if os(iOS)
                // The system's own paste button: reading the clipboard from it
                // needs no "Allow Paste?" prompt, which reading it in code
                // does every single time.
                PasteButton(payloadType: String.self) { strings in
                    guard let pasted = strings.first else { return }
                    link = pasted
                    Task { await save() }
                }
                .labelStyle(.titleAndIcon)
                #endif

                Button {
                    Task { await save() }
                } label: {
                    if isChecking {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            Text(Copy.Common.checking)
                        }
                    } else {
                        Label(Copy.Common.save, systemImage: "checkmark")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(link.trimmingCharacters(in: .whitespaces).isEmpty || isChecking)
            }
            .controlSize(.regular)
            .buttonBorderShape(.capsule)
            .tint(Theme.sky)
        }
    }

    /// Takes the token out of the link, makes sure Patreon accepts it, and
    /// keeps it. Only the token is stored — the rest of the link is always
    /// the same.
    private func save() async {
        error = nil
        guard let token = PatreonAccount.token(fromFeedLink: link) else {
            error = Copy.Patreon.invalidLink
            return
        }

        // Checked against one of the shows Patreon carries, where the
        // catalogue has one yet; a first launch with nothing synced keeps it
        // unchecked rather than refusing it.
        var descriptor = FetchDescriptor<Show>(predicate: #Predicate { $0.patreonShowId != nil })
        descriptor.fetchLimit = 1
        if let showId = try? modelContext.fetch(descriptor).first?.patreonShowId {
            isChecking = true
            defer { isChecking = false }
            do {
                try await PatreonFeeds.shared.check(token: token, showId: showId)
            } catch {
                self.error = error.localizedDescription
                return
            }
        }

        account.setToken(token)
        link = ""
    }
}

/// Where the RSS link is on Patreon. It is several taps deep, and nothing on
/// Patreon's side calls it what this screen does, so the steps are spelled
/// out with the button names exactly as Patreon shows them.
///
/// The links open outside the app — in the Patreon app where it's installed,
/// the browser otherwise — since signing in to Patreon is not something to do
/// inside someone else's app.
private struct PatreonLinkSteps: View {
    /// Markdown, so the two links are real links and Patreon's button names can
    /// be picked out in bold.
    private let steps: [AttributedString] = [
        Copy.Patreon.stepLogin,
        Copy.Patreon.stepOpenShow,
        Copy.Patreon.stepListen,
        Copy.Patreon.stepOtherApps,
        Copy.Patreon.stepCopy,
        AttributedString(Copy.Patreon.stepPaste),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(index + 1)")
                        .font(Theme.bold(11, relativeTo: .caption))
                        .monospacedDigit()
                        .foregroundStyle(Theme.sky)
                        .frame(width: 14, alignment: .trailing)
                    Text(step)
                        .font(Theme.body(12.5, relativeTo: .callout))
                        .foregroundStyle(Theme.bone)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Theme.sky)
        .accessibilityElement(children: .contain)
    }
}

/// One preference: what it does on the left, the switch on the right.
private struct SettingRow: View {
    let title: String
    let detail: String
    @Binding var isOn: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(Theme.semibold(14, relativeTo: .headline))
                    .foregroundStyle(Theme.bone)
                    .multilineTextAlignment(.leading)
                Text(detail)
                    .font(Theme.body(11.5, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(1)
            }

            Spacer(minLength: 0)

            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(Theme.sky)
        }
        .padding(14)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.line, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    SettingsView()
}
