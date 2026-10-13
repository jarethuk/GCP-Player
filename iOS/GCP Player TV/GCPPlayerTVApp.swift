//
//  GCPPlayerTVApp.swift
//  GCP Player TV
//
//  The Apple TV app's entry point. The same database, player and sync
//  engines as the phone — shared from the GCP Player folder — with a
//  television's worth of screens on top.
//

import SwiftUI
import SwiftData

@main
struct GCPPlayerTVApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        Settings.registerDefaults()
    }

    var body: some Scene {
        WindowGroup {
            TVContentView()
                .environment(PlayerModel.shared)
                // Nothing downloads on tvOS, but the shared views and models
                // still look for it.
                .environment(DownloadManager.shared)
                .preferredColorScheme(.dark)
                .tint(Theme.sky)
                .task {
                    // The TV is the device most likely to be picked up
                    // *after* another one — this is what makes "Continue"
                    // show the phone's place.
                    CloudSyncEngine.shared.start(container: AppDatabase.container)
                }
                // The same two moments as on the phone: get this device's
                // position up on the way out, and ask for anything a missed
                // push would have brought on the way in.
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .background:
                        PlayerModel.shared.flushPosition()
                        CloudSyncEngine.shared.sendPendingChanges()
                    case .active:
                        CloudSyncEngine.shared.fetchChanges()
                    default:
                        break
                    }
                }
        }
        .modelContainer(AppDatabase.container)
    }
}
