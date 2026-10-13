//
//  TVSettingsView.swift
//  GCP Player TV
//
//  Most of the phone's settings are about downloads, and a TV downloads
//  nothing. What's left: whether iCloud is carrying your place across, and
//  the reset for a local copy that has drifted.
//

import CloudKit
import SwiftUI
import SwiftData

struct TVSettingsView: View {
    @Environment(\.modelContext) private var modelContext

    @State private var isConfirmingReset = false
    @State private var isResetting = false
    @State private var resetError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 56) {
                TVScreenHeader(eyebrow: Copy.Settings.eyebrow, title: Copy.Settings.title)

                VStack(alignment: .leading, spacing: 16) {
                    TVMetaLabel(text: Copy.Settings.icloud, color: Theme.sky)
                    Text(cloudStatusText)
                        .font(Theme.body(TVTheme.body, relativeTo: .body))
                        .foregroundStyle(Theme.bone.opacity(0.85))
                        .lineSpacing(6)
                        .frame(maxWidth: 1200, alignment: .leading)
                }

                VStack(alignment: .leading, spacing: 20) {
                    Button {
                        isConfirmingReset = true
                    } label: {
                        Label(Copy.Settings.clearData, systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(TVPillButtonStyle(isPrimary: false))
                    .disabled(isResetting)

                    Text(Copy.Tv.storageNote)
                        .font(Theme.body(TVTheme.caption, relativeTo: .caption))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: 1200, alignment: .leading)
                }
            }
            .padding(.bottom, 60)
        }
        .confirmationDialog(Copy.Settings.clearDataConfirmTitle, isPresented: $isConfirmingReset, titleVisibility: .visible) {
            Button(Copy.Settings.clearDataConfirm, role: .destructive) {
                Task { await clearAndResync() }
            }
            Button(Copy.Common.cancel, role: .cancel) {}
        } message: {
            Text(Copy.Tv.clearDataMessage)
        }
        .alert(
            Copy.Settings.clearDataFailedTitle,
            isPresented: Binding(get: { resetError != nil }, set: { if !$0 { resetError = nil } })
        ) {
            Button(Copy.Common.ok, role: .cancel) { resetError = nil }
        } message: {
            Text(resetError ?? "")
        }
        .overlay {
            if isResetting {
                ZStack {
                    Theme.ink.opacity(0.85).ignoresSafeArea()
                    VStack(spacing: 24) {
                        ProgressView().tint(Theme.sky)
                        TVMetaLabel(text: Copy.Settings.clearing, showsTick: false)
                    }
                }
            }
        }
    }

    private func clearAndResync() async {
        isResetting = true
        defer { isResetting = false }
        do {
            _ = try await SyncEngine.clearAndResync(modelContext: modelContext)
        } catch {
            resetError = error.localizedDescription
        }
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
            let base = Copy.Tv.icloudSyncing
            guard let at = [sync.lastImportedAt, sync.lastSentAt].compactMap({ $0 }).max() else { return base }
            return base + " " + Copy.Settings.icloudLastSynced(at.formatted(.relative(presentation: .named)))
        case .noAccount:
            return Copy.Tv.icloudNoAccount
        case .restricted:
            return Copy.Tv.icloudRestricted
        case .temporarilyUnavailable:
            return Copy.Tv.icloudUnavailable
        default:
            return Copy.Settings.icloudChecking
        }
    }
}
