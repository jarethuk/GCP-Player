//
//  AppDatabase.swift
//  GCP Player
//
//  The app's single on-device database. Held in an explicit shared
//  instance (rather than created privately by .modelContainer(for:))
//  so the CarPlay scene can reach the same store as the phone UI.
//

import Foundation
import SwiftData

@MainActor
enum AppDatabase {
    static let container: ModelContainer = {
        do {
            // PendingListeningState holds iCloud state whose show or
            // episode hasn't arrived from the API yet — see CloudSyncEngine.
            // PatreonCredential is the one setting kept here rather than in
            // UserDefaults, because it syncs — see PatreonAccount.
            let schema = Schema([
                Show.self, Episode.self, PendingListeningState.self, PatreonCredential.self,
            ])
            // cloudKitDatabase: .none is load-bearing, and not a default.
            //
            // A ModelConfiguration left to itself mirrors the *whole store*
            // to CloudKit as soon as the app has an iCloud entitlement —
            // which this one now has, for CloudSyncEngine. That mirroring
            // forbids unique constraints and requires every attribute to be
            // optional or defaulted, so with it on, this store refuses to
            // open at all: "CloudKit integration does not support unique
            // constraints … Episode: guid".
            //
            // Which is the right outcome, only louder than it sounds: the
            // catalogue belongs to the API, and the three fields that are
            // genuinely the user's travel as their own small records. See
            // the header of CloudSyncEngine.swift.
            #if os(tvOS)
            let configuration = ModelConfiguration(
                schema: schema, url: preparedTVStoreURL(), cloudKitDatabase: .none
            )
            #else
            let configuration = ModelConfiguration(schema: schema, cloudKitDatabase: .none)
            #endif
            return try ModelContainer(for: schema, configurations: configuration)
        } catch {
            fatalError("Could not open the app database: \(error)")
        }
    }()

    #if os(tvOS)
    /// Apple TV has no persistent local storage: an app may write to Caches
    /// and little else, and the system empties Caches whenever it wants the
    /// space. So on tvOS the whole store is a cache — which it can afford to
    /// be, because the catalogue comes back from the API and the listening
    /// state comes back from iCloud.
    ///
    /// Everything that describes the store lives in here with it (the
    /// iCloud engine's state too — see CloudSyncEngine.stateURL), so a purge
    /// takes all of it at once rather than leaving a cursor that describes a
    /// catalogue which is no longer there.
    nonisolated static let tvStoreDirectory: URL = {
        let caches = (try? FileManager.default.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )) ?? URL.temporaryDirectory
        return caches.appending(path: "Store", directoryHint: .isDirectory)
    }()

    /// The store's location, after making sure nothing outlived a purge.
    ///
    /// The shows cursor is the dangerous survivor: it lives in UserDefaults,
    /// which the system doesn't purge, and a sync carrying it asks the API
    /// only for what changed since — which, for an empty store, is nothing.
    private static func preparedTVStoreURL() -> URL {
        let store = tvStoreDirectory.appending(path: "default.store")
        if !FileManager.default.fileExists(atPath: store.path) {
            try? FileManager.default.removeItem(at: tvStoreDirectory)
            UserDefaults.standard.removeObject(forKey: SyncEngine.showsCursorKey)
        }
        try? FileManager.default.createDirectory(at: tvStoreDirectory, withIntermediateDirectories: true)
        return store
    }
    #endif
}
