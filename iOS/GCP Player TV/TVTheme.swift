//
//  TVTheme.swift
//  GCP Player TV
//
//  Theme.swift's palette at television size, and the focus treatment that
//  stands in for touch.
//
//  Nothing here is a new colour. The TV reads from three metres away, so
//  the type roughly triples, but it is the same navy, the same two faces
//  and the same rule that ember means "newly published" and nothing else.
//
//  tvOS lays out on a 1920 × 1080 pt canvas on every Apple TV, and SwiftUI
//  already keeps content inside the overscan-safe margins (80 pt at the
//  sides, 60 at top and bottom) — so there are no margins to set here, only
//  the places that deliberately run past them: artwork.
//

import SwiftUI

enum TVTheme {
    /// One step above `Theme.surface` — what a focused row lifts to.
    static let surfaceHigh = Color(hex: 0x0A3A5E)

    // The type scale. Point sizes on the 1920 × 1080 canvas.
    static let heroTitle: CGFloat = 76
    static let screenTitle: CGFloat = 57
    static let rowHeading: CGFloat = 38
    static let body: CGFloat = 31
    static let caption: CGFloat = 25
    static let meta: CGFloat = 22

    /// Five across the safe width with room for the focused one to grow.
    static let posterSize: CGFloat = 300
    static let posterSpacing: CGFloat = 48
}

/// `MetaLabel` at a size that survives the distance: the site's bold,
/// widely tracked caps behind a short blue tick.
struct TVMetaLabel: View {
    let text: String
    var showsTick = true
    var color: Color = Theme.muted

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if showsTick {
                Capsule()
                    .fill(Theme.sky)
                    .frame(width: 4, height: 22)
            }
            Text(text.uppercased())
                .font(Theme.bold(TVTheme.meta, relativeTo: .caption))
                .tracking(3.2)
                .foregroundStyle(color)
                .lineLimit(1)
        }
    }
}

/// The screen-title treatment: display caps over the site's gradient rule.
struct TVScreenHeader: View {
    let eyebrow: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TVMetaLabel(text: eyebrow, showsTick: false, color: Theme.sky)
            Text(title)
                .font(Theme.display(TVTheme.screenTitle, relativeTo: .largeTitle))
                .textCase(.uppercase)
                .foregroundStyle(Theme.bone)
            Capsule()
                .fill(Theme.accentGradient)
                .frame(width: 112, height: 6)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Focus

/// The pill that plays something. Focused, it takes the network's gradient —
/// the app's only use of it, on TV as on the phone, is the thing that plays.
struct TVPillButtonStyle: ButtonStyle {
    var isPrimary = true

    func makeBody(configuration: Configuration) -> some View {
        TVPill(configuration: configuration, isPrimary: isPrimary)
    }

    private struct TVPill: View {
        let configuration: ButtonStyle.Configuration
        let isPrimary: Bool
        @Environment(\.isFocused) private var isFocused

        var body: some View {
            configuration.label
                .font(Theme.bold(TVTheme.caption, relativeTo: .headline))
                .tracking(2.4)
                .textCase(.uppercase)
                .foregroundStyle(isFocused ? Theme.inkDeep : Theme.bone)
                .padding(.horizontal, 40)
                .padding(.vertical, 22)
                .background {
                    Capsule().fill(isFocused ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.surface))
                }
                .overlay {
                    Capsule().strokeBorder(isFocused ? .clear : Theme.line, lineWidth: 2)
                }
                .opacity(isPrimary || isFocused ? 1 : 0.9)
                .scaleEffect(configuration.isPressed ? 0.97 : (isFocused ? 1.06 : 1))
                .shadow(color: Color(hex: 0x00548E).opacity(isFocused ? 0.6 : 0), radius: 24, y: 12)
                .animation(.easeOut(duration: 0.18), value: isFocused)
        }
    }
}

/// An episode row. Focus lifts it onto `surfaceHigh` with a sky edge —
/// focus is the only cursor there is, so it has to be unmissable.
struct TVRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        TVRow(configuration: configuration)
    }

    private struct TVRow: View {
        let configuration: ButtonStyle.Configuration
        @Environment(\.isFocused) private var isFocused

        var body: some View {
            configuration.label
                .padding(.horizontal, 32)
                .padding(.vertical, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    isFocused ? TVTheme.surfaceHigh : Theme.surface.opacity(0.55),
                    in: RoundedRectangle(cornerRadius: 16)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(isFocused ? Theme.sky : Theme.line, lineWidth: isFocused ? 3 : 1)
                }
                .scaleEffect(configuration.isPressed ? 0.99 : (isFocused ? 1.02 : 1))
                .shadow(color: .black.opacity(isFocused ? 0.45 : 0), radius: 24, y: 14)
                .animation(.easeOut(duration: 0.18), value: isFocused)
        }
    }
}

// MARK: - Posters

/// One cover, with its name over a scrim: the iPad's poster-wall tile, made
/// focusable. `.card` gives it the system's lift, shadow and parallax, which
/// is what an Apple TV owner's thumb already expects of a poster.
struct TVPosterTile<Destination: Hashable>: View {
    let show: Show
    let unplayedCount: Int
    let value: Destination

    private var hasNewEpisode: Bool { show.hasNewEpisode(unplayedCount: unplayedCount) }
    private var isLockedNew: Bool { show.hasLockedNewEpisode(unplayedCount: unplayedCount) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            NavigationLink(value: value) {
                WideArtworkView(urlString: show.artworkUrl, renderSize: TVTheme.posterSize)
                    .frame(width: TVTheme.posterSize, height: TVTheme.posterSize)
                    .overlay(alignment: .bottom) {
                        LinearGradient(
                            colors: [.clear, Theme.inkDeep.opacity(0.92)],
                            startPoint: .center,
                            endPoint: .bottom
                        )
                    }
                    .overlay(alignment: .bottomLeading) {
                        Text(show.title)
                            .font(Theme.display(26, relativeTo: .headline))
                            .textCase(.uppercase)
                            .foregroundStyle(Theme.bone)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .shadow(color: .black.opacity(0.6), radius: 8, y: 2)
                            .padding(18)
                    }
                    .overlay(alignment: .topTrailing) {
                        if hasNewEpisode {
                            Text(Copy.Shows.newChip)
                                .font(Theme.bold(18, relativeTo: .caption2))
                                .tracking(2)
                                .textCase(.uppercase)
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Theme.ember, in: RoundedRectangle(cornerRadius: 6))
                                .padding(14)
                        } else if isLockedNew {
                            PatreonLockChip(scale: 2)
                                .background(Theme.inkDeep.opacity(0.8), in: RoundedRectangle(cornerRadius: 8))
                                .padding(14)
                        }
                    }
            }
            .buttonStyle(.card)
            .contextMenu {
                Button {
                    show.setStarred(!show.isStarred)
                } label: {
                    Label(show.isStarred ? Copy.Show.removeFromMyShows : Copy.Show.addToMyShows,
                          systemImage: show.isStarred ? "star.slash" : "star")
                }
            }

            TVMetaLabel(text: subtitle)
                .frame(width: TVTheme.posterSize, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(hasNewEpisode ? "\(show.title), \(subtitle), \(Copy.Shows.a11yNewEpisode)" : "\(show.title), \(subtitle)")
    }

    private var subtitle: String {
        if unplayedCount > 0 { return Copy.Shows.unplayedCount(unplayedCount) }
        return show.system ?? Copy.Shows.allPlayed
    }
}

// MARK: - Presenting the player

extension EnvironmentValues {
    /// Brings Now Playing to the front. Home and Top Shelf resume into it;
    /// a show's episode list deliberately doesn't — see TVShowView.
    @Entry var presentNowPlaying: () -> Void = {}
}
