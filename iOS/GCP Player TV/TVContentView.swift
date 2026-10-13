//
//  TVContentView.swift
//  GCP Player TV
//
//  The TV app's shape: a tab bar along the top, and one full screen at a
//  time beneath it.
//
//  The iPad puts pick, browse and play side by side. A television can't —
//  focus sits in one place, and text that reads from the sofa is three
//  times the size — so the zones become tabs. Now Playing is a tab of its
//  own that appears once something is loaded: it is where Back from the
//  player lands you, and where focus goes when you want the player again,
//  which is everything the phone's mini player bar was for.
//

import SwiftUI
import SwiftData

enum TVTab: Hashable {
    case home, shows, nowPlaying, settings
}

struct TVContentView: View {
    @Environment(PlayerModel.self) private var player
    @Environment(\.modelContext) private var modelContext

    /// The counts and the catalogue sync, shared by Home and Shows.
    @State private var showsModel = ShowsModel()
    @State private var tab: TVTab = .home

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                TVHomeView()
                    .navigationDestination(for: Show.self) { TVShowView(show: $0) }
            }
            .tabItem { Text(Copy.Tv.home) }
            .tag(TVTab.home)

            NavigationStack {
                TVShowsGridView()
                    .navigationDestination(for: Show.self) { TVShowView(show: $0) }
            }
            .tabItem { Text(Copy.Shows.title) }
            .tag(TVTab.shows)

            if player.currentEpisode != nil {
                TVNowPlayingView()
                    .tabItem { Label(Copy.Tv.nowPlaying, systemImage: "waveform") }
                    .tag(TVTab.nowPlaying)
            }

            TVSettingsView()
                .tabItem { Text(Copy.Settings.title) }
                .tag(TVTab.settings)
        }
        .environment(showsModel)
        .environment(\.presentNowPlaying) { tab = .nowPlaying }
        .networkBackground()
        // The remote's play/pause button works everywhere in the app, not
        // only on the player — the same promise the lock screen makes.
        .onPlayPauseCommand { player.togglePlayPause() }
        .task {
            player.restoreLastEpisode(from: modelContext)
            await showsModel.sync(in: modelContext)
        }
        // A played mark or a star arriving from the phone changes counts
        // that no query would refresh.
        .onChange(of: CloudSyncEngine.shared.lastImportedAt) {
            let shows = (try? modelContext.fetch(FetchDescriptor<Show>())) ?? []
            showsModel.loadCounts(for: shows, in: modelContext)
        }
        // A Patreon token arriving from the phone unlocks episodes, which
        // moves what counts as new.
        .onChange(of: PatreonAccount.shared.changedAt) {
            let shows = (try? modelContext.fetch(FetchDescriptor<Show>())) ?? []
            showsModel.loadCounts(for: shows, in: modelContext)
        }
    }
}
