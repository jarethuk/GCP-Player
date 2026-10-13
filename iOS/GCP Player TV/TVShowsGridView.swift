//
//  TVShowsGridView.swift
//  GCP Player TV
//
//  Every show, as posters. The iPad's poster wall with focus added.
//
//  No index and no search: at 32 shows this is seven rows of swiping, and
//  search would mean typing on a remote — which costs more than it saves.
//  Long-press a poster to star it; that is how a show joins Home's My Shows
//  row without having to be played first.
//

import SwiftUI
import SwiftData

struct TVShowsGridView: View {
    @Environment(ShowsModel.self) private var model

    @Query(sort: [SortDescriptor(\Show.latestEpisodeAt, order: .reverse), SortDescriptor(\Show.title)])
    private var shows: [Show]

    private let columns = Array(
        repeating: GridItem(.fixed(TVTheme.posterSize), spacing: TVTheme.posterSpacing, alignment: .top),
        count: 5
    )

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 48) {
                TVScreenHeader(eyebrow: Copy.Shows.eyebrow, title: Copy.Shows.gridTitle)

                LazyVGrid(columns: columns, alignment: .leading, spacing: 64) {
                    ForEach(shows) { show in
                        TVPosterTile(show: show, unplayedCount: model.unplayed(show), value: show)
                    }
                }
            }
            .padding(.bottom, 60)
        }
        .scrollClipDisabled()
        .overlay {
            if shows.isEmpty { TVLoadingState() }
        }
    }
}
