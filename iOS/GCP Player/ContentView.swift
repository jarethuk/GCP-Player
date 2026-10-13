//
//  ContentView.swift
//  GCP Player
//
//  Created by Ben on 16/09/2026.
//
//  Where the app decides what shape it is.
//
//  On a phone it is a stack: shows, then a show, then an episode. Given a
//  regular width the shows leave the stack and become a sidebar that is
//  always there, and the middle is one push deep instead of two.
//
//  The player is the same in both, deliberately. It was a column of its own
//  on the widest layouts for a while, and a permanent 340 points of player
//  beside a 320-point sidebar left the thing you were actually reading —
//  sixty episodes of a show — squeezed into what was left. So: the bar at
//  the foot of the content, and the same dialog the phone opens when you
//  tap it.
//
//  One rule decides the layout, and it is the size class — never the
//  device. An iPad in Slide Over is 320 points wide, narrower than the
//  iPhone this was drawn for, and gets the phone's layout exactly; that is
//  also what keeps the phone from regressing while the iPad changes.
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(PlayerModel.self) private var player
    @Environment(\.modelContext) private var modelContext
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// The counts and the catalogue sync, shared by whatever is showing
    /// the shows — one view on a phone, two at once on an iPad.
    @State private var showsModel = ShowsModel()

    /// Explicit, so Now Playing — which is presented over whichever layout
    /// is showing — can send the user to the show it's playing.
    @State private var path = NavigationPath()
    @State private var isShowingNowPlaying = false

    // -- Regular width ---------------------------------------------------

    @State private var selectedShow: Show?
    @State private var detailPath = NavigationPath()

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                splitLayout
            } else {
                stackLayout
            }
        }
        .environment(showsModel)
        // The same dialog in both layouts: a sheet over the stack on a
        // phone, and at a regular width the centred form sheet iPadOS
        // makes of one, which is roomier than the player column this
        // replaced and doesn't cost the episode list its width.
        .sheet(isPresented: $isShowingNowPlaying) {
            NowPlayingView { show in
                // Close the sheet first, then navigate: the layout is
                // behind it.
                isShowingNowPlaying = false
                goToShow(show)
            }
        }
        .background { keyboardCommands }
        // Bring back whatever was playing when the app was last used, so
        // the mini player is waiting where the user left it.
        .task {
            player.restoreLastEpisode(from: modelContext)
        }
    }

    // MARK: - Compact: one stack

    private var stackLayout: some View {
        NavigationStack(path: $path) {
            ShowsView()
                .toolbarBackground(Theme.ink, for: .navigationBar)
                // These map navigation values to screens: when a Show is
                // pushed, show ShowView; when an Episode is pushed, EpisodeView.
                .navigationDestination(for: Show.self) { show in
                    ShowView(show: show)
                }
                .navigationDestination(for: Episode.self) { episode in
                    EpisodeView(episode: episode)
                }
                .navigationDestination(for: SettingsRoute.self) { _ in
                    SettingsView()
                }
        }
        .overlay(alignment: .bottom) { miniPlayer }
        .contentMargins(.bottom, playerInset, for: .scrollContent)
    }

    // MARK: - Regular: a sidebar and the content beside it

    private var splitLayout: some View {
        NavigationSplitView {
            ShowsSidebar(selection: $selectedShow)
                .navigationSplitViewColumnWidth(min: 280, ideal: 320, max: 360)
        } detail: {
            detailStack
        }
        // Both columns at once wherever they fit, rather than the detail
        // shouldering the sidebar off screen in portrait.
        .navigationSplitViewStyle(.balanced)
        // The bar runs the full width of the window, over both columns —
        // what is playing belongs to the app, not to the column it was
        // started from. The margin goes on out here with it, so the
        // sidebar's last show clears the bar as well as the detail's.
        .overlay(alignment: .bottom) { miniPlayer }
        .contentMargins(.bottom, playerInset, for: .scrollContent)
        .onChange(of: selectedShow) {
            // A different show means the episode pushed on top of the last
            // one has to go, or the detail is showing an episode that isn't
            // in the list beside it.
            detailPath = NavigationPath()
        }
    }

    private var detailStack: some View {
        NavigationStack(path: $detailPath) {
            Group {
                if let selectedShow {
                    ShowView(show: selectedShow)
                } else {
                    // Not "select a show": the covers are worth looking at,
                    // and this is the only place they are ever shown big.
                    ShowsGridView(selection: $selectedShow)
                }
            }
            .navigationDestination(for: Show.self) { show in
                ShowView(show: show)
            }
            .navigationDestination(for: Episode.self) { episode in
                EpisodeView(episode: episode)
            }
            .navigationDestination(for: SettingsRoute.self) { _ in
                SettingsView()
            }
        }
    }

    // MARK: - Shared pieces

    /// The bar *overlays* the lists (rather than insetting them), so
    /// content scrolls underneath its translucent blur…
    @ViewBuilder
    private var miniPlayer: some View {
        // Only show the bar once something has been played.
        if player.currentEpisode != nil {
            MiniPlayerBar()
                .onTapGesture {
                    isShowingNowPlaying = true
                }
        }
    }

    /// …while this bottom margin (inherited by every scroll view under it)
    /// makes sure the last row can still scroll up into view.
    private var playerInset: CGFloat {
        player.currentEpisode != nil ? 64 : 0
    }

    /// Now Playing's link back to the show it is playing, which has to land
    /// somewhere different in each layout: a push on a phone, a change of
    /// selection on an iPad.
    private func goToShow(_ show: Show) {
        if horizontalSizeClass == .regular {
            selectedShow = show
            detailPath = NavigationPath()
        } else {
            path.append(show)
        }
    }

    /// The keys an iPad on a keyboard already expects to answer.
    ///
    /// Buttons rather than a command menu: this app has no menu bar, and a
    /// Button carrying a shortcut anywhere in the hierarchy answers for the
    /// whole window. They are invisible but not `hidden` — a hidden view
    /// leaves the responder chain and takes its shortcut with it.
    private var keyboardCommands: some View {
        Group {
            Button(Copy.Keyboard.playPause) { player.togglePlayPause() }
                .keyboardShortcut(.space, modifiers: [])
            Button(Copy.Keyboard.back15) { player.skip(by: -15) }
                .keyboardShortcut(.leftArrow, modifiers: [])
            Button(Copy.Keyboard.forward30) { player.skip(by: 30) }
                .keyboardShortcut(.rightArrow, modifiers: [])
            Button(Copy.Keyboard.nextEpisode) { player.playNext() }
                .keyboardShortcut(.rightArrow, modifiers: .shift)
            Button(Copy.Keyboard.syncNow) { Task { await showsModel.sync(in: modelContext) } }
                .keyboardShortcut("r", modifiers: .command)
        }
        .opacity(0)
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
    }
}

#Preview {
    ContentView()
        .environment(PlayerModel())
        .modelContainer(SampleData.previewContainer)
}
