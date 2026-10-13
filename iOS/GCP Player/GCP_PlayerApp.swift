//
//  GCP_PlayerApp.swift
//  GCP Player
//
//  Created by Ben on 16/09/2026.
//

import SwiftUI
import SwiftData

@main
struct GCP_PlayerApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Before anything reads them: an unregistered flag reads false.
        Settings.registerDefaults()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                // Puts the player into the "environment" — a dictionary of
                // shared objects that flows down to every child view, so we
                // don't have to pass it through each view manually.
                // PlayerModel.shared because the CarPlay scene drives the
                // same player.
                .environment(PlayerModel.shared)
                // The download store, for the offline indicators.
                .environment(DownloadManager.shared)
                // Dark-only, by design: the network has no light mode, and
                // a light variant would strand the navy that carries the
                // identity. See Theme.swift.
                .preferredColorScheme(.dark)
                .tint(Theme.sky)
                .task {
                    // Drop downloads that have been heard or have sat for
                    // a week. Artwork is deliberately not swept: covers
                    // are tiny and change about never.
                    DownloadManager.shared.purgeExpired(in: AppDatabase.container.mainContext)

                    // Listening state to and from the user's other devices.
                    // Started here rather than lazily: the engine has to
                    // exist before a change can be queued against it, and
                    // the first thing someone does after launching is play
                    // something.
                    CloudSyncEngine.shared.start(container: AppDatabase.container)
                }
                // The two moments that matter to syncing, and the app's
                // only use of scenePhase. Leaving: get this device's
                // position up before the other one is picked up. Arriving:
                // ask for anything a missed push would have brought — a
                // Simulator never gets one at all.
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
        // The shared database — also used by the CarPlay scene.
        .modelContainer(AppDatabase.container)
        // Lets iOS relaunch the app to hand over downloads that finished
        // while it was suspended. Without this the session's results wait
        // until the user next opens the app.
        .backgroundTask(.urlSession("bencreswell.gcpplayer.downloads")) { }
    }
}
