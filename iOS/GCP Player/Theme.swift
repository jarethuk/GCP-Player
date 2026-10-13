//
//  Theme.swift
//  GCP Player
//
//  The Glass Cannon Network's visual language, as app tokens.
//
//  The colours and both gradients are the network's own values, read off
//  glasscannonnetwork.com. Open Sans is the site's body face; the site's
//  display face is Babell, which isn't licensed for this, so Archivo Black
//  stands in — both are bundled in Fonts/ and declared in Info.plist.
//
//  The app is dark-only by design: the network has no light mode, and a
//  light variant would strand the navy that carries the identity.
//

import SwiftUI

enum Theme {

    // MARK: - Colour

    /// The network's page background.
    static let ink = Color(hex: 0x03253F)
    /// Below the ground: bars, the player's chrome.
    static let inkDeep = Color(hex: 0x021A2E)
    /// Rows and cards, one step up from the ground.
    static let surface = Color(hex: 0x06304F)
    /// Hairlines and borders — the accent at low opacity, never grey.
    static let line = Color(hex: 0x7CC0DF).opacity(0.16)
    static let sky = Color(hex: 0x7CC0DF)
    static let bone = Color(hex: 0xEAF2F8)
    /// Secondary text: a neutral biased toward the accent.
    static let muted = Color(hex: 0x9DB8CC)
    /// Semantic only — a show with something unheard. Never decoration.
    static let ember = Color(hex: 0xE2483C)

    /// The site's button gradient, 118.64°. CSS angles are measured
    /// clockwise from "to top", so the direction vector is
    /// (sin θ, −cos θ) and the endpoints sit ±½ of it from the centre.
    static let accentGradient = LinearGradient(
        stops: [
            .init(color: Color(hex: 0x66C4EF), location: 0.145),
            .init(color: Color(hex: 0x5DBBE7), location: 0.258),
            .init(color: Color(hex: 0x47A2D2), location: 0.435),
            .init(color: Color(hex: 0x237BB0), location: 0.661),
            .init(color: Color(hex: 0x00548E), location: 0.851),
        ],
        startPoint: UnitPoint(x: 0.061, y: 0.260),
        endPoint: UnitPoint(x: 0.939, y: 0.740)
    )

    /// The site's section gradient, 115.55°. The app's page background.
    static let groundGradient = LinearGradient(
        stops: [
            .init(color: Color(hex: 0x03253F), location: 0.076),
            .init(color: Color(hex: 0x043559), location: 0.759),
        ],
        startPoint: UnitPoint(x: 0.049, y: 0.284),
        endPoint: UnitPoint(x: 0.951, y: 0.716)
    )

    // MARK: - Type

    private static let displayFace = "ArchivoBlack-Regular"
    private static let bodyFace = "OpenSans-Regular"
    private static let semiboldFace = "OpenSans-SemiBold"
    private static let boldFace = "OpenSans-Bold"

    /// Show and screen titles. Always set uppercase — the face is a
    /// display weight and reads as shouting by design.
    /// `relativeTo:` keeps custom faces scaling with Dynamic Type.
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .headline) -> Font {
        .custom(displayFace, size: size, relativeTo: style)
    }

    static func body(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(bodyFace, size: size, relativeTo: style)
    }

    static func semibold(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(semiboldFace, size: size, relativeTo: style)
    }

    static func bold(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(boldFace, size: size, relativeTo: style)
    }
}

extension Color {
    /// `Color(hex: 0x7CC0DF)` — the form the network publishes its palette in.
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

// MARK: - Shared components

/// The site's metadata treatment: bold uppercase, widely tracked, behind
/// a short blue tick. Used for a show's game system, an episode's numbers,
/// anything the site would set as a label.
struct MetaLabel: View {
    let text: String
    var showsTick = true
    var color: Color = Theme.muted
    /// Systems run long ("Pathfinder 2E Quest for the Frozen Flame"), so
    /// callers with room can let them wrap rather than truncate.
    var lineLimit = 1

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            if showsTick {
                Capsule()
                    .fill(Theme.sky)
                    .frame(width: 2, height: 10)
                    // Sits on the first line's cap height, not the block's.
                    .padding(.top, 2)
            }
            Text(text.uppercased())
                // 2.1px of tracking at 14px on the site; scaled to fit here.
                .font(Theme.bold(9.5, relativeTo: .caption2))
                .tracking(1.4)
                .foregroundStyle(color)
                .lineLimit(lineLimit)
                .multilineTextAlignment(.leading)
        }
    }
}

/// The network's pill button, and the app's only use of the gradient:
/// it marks the thing that plays.
struct GradientPlayButton: View {
    let isPlaying: Bool
    var size: CGFloat = 62
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Circle()
                .fill(Theme.accentGradient)
                .frame(width: size, height: size)
                .overlay {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: size * 0.32, weight: .black))
                        .foregroundStyle(Theme.inkDeep)
                        // Optical centring: the play triangle's mass sits
                        // left of its bounding box.
                        .offset(x: isPlaying ? 0 : size * 0.025)
                }
                .shadow(color: Color(hex: 0x00548E).opacity(0.55), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isPlaying ? Copy.Episode.pause : Copy.Episode.play)
    }
}

/// Whether an episode is held on device. Deliberately quiet: downloaded
/// is the normal state for anything you're about to hear, so it reads as a
/// small confirmation rather than a badge competing with NEW.
struct DownloadIndicator: View {
    let episode: Episode
    var showsLabel = false

    @Environment(DownloadManager.self) private var downloads

    var body: some View {
        if downloads.isDownloading(episode) {
            let fraction = downloads.progress[episode.guid] ?? 0
            HStack(spacing: 6) {
                // A ring that fills, rather than a spinner: the file is
                // big enough that "how far" is the useful part.
                ZStack {
                    Circle()
                        .strokeBorder(Theme.sky.opacity(0.25), lineWidth: 2)
                    Circle()
                        .trim(from: 0, to: max(fraction, 0.02))
                        .stroke(Theme.sky, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 14, height: 14)
                .animation(.easeOut(duration: 0.25), value: fraction)

                if showsLabel {
                    Text(Copy.Download.progress(Int(fraction * 100)))
                        .font(Theme.bold(9.5, relativeTo: .caption2))
                        .tracking(1.4)
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.muted)
                }
            }
            .accessibilityLabel(Copy.Download.a11yProgress(Int(fraction * 100)))
        } else if episode.isDownloaded {
            HStack(spacing: 6) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.sky)
                if showsLabel {
                    Text(Copy.Download.downloaded)
                        .font(Theme.bold(9.5, relativeTo: .caption2))
                        .tracking(1.4)
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.sky)
                }
            }
            .accessibilityLabel(Copy.Download.a11yDownloaded)
        } else if showsLabel {
            HStack(spacing: 6) {
                Image(systemName: "wifi")
                    .font(.system(size: 12))
                Text(Copy.Download.streaming)
                    .font(Theme.bold(9.5, relativeTo: .caption2))
                    .tracking(1.4)
                    .textCase(.uppercase)
            }
            .foregroundStyle(Theme.muted)
            .accessibilityLabel(Copy.Download.streaming)
        }
    }
}

/// The app's round icon control: a sky glyph on a surface disc with a hairline
/// edge. Screens that carry their own header use these rather than system
/// toolbar buttons, so the controls belong to the page instead of sitting in a
/// bar above it.
///
/// A label rather than a button, because the same treatment has to work for a
/// Button, a NavigationLink and a Menu.
struct CircleIconLabel: View {
    let systemImage: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.sky)
            .frame(width: 38, height: 38)
            .background(Theme.surface, in: Circle())
            .overlay { Circle().strokeBorder(Theme.line, lineWidth: 1) }
    }
}

/// Where the NEW chip goes, on a show whose new episodes are Patreon's and
/// this device has no token to play them with. The same box as NEW, drawn
/// quiet — an outline, not the red that means "go and listen".
struct PatreonLockChip: View {
    var scale: CGFloat = 1

    var body: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: 9 * scale, weight: .bold))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 7 * scale)
            .padding(.vertical, 3 * scale)
            // As tall as the NEW chip's caps beside it would be.
            .frame(minHeight: 17 * scale)
            .overlay {
                RoundedRectangle(cornerRadius: 4 * scale)
                    .strokeBorder(Theme.muted.opacity(0.5), lineWidth: 1)
            }
            .accessibilityLabel(Copy.Episode.a11yLocked)
    }
}

/// A round, outlined transport control — the 15/30 second skips.
struct SkipButton: View {
    let seconds: Int
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.bone)
                .frame(width: 44, height: 44)
                .overlay {
                    Circle().strokeBorder(Theme.bone.opacity(0.35), lineWidth: 1.5)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Copy.Player.a11ySkip(seconds))
    }
}

extension View {
    /// The app's page background: the network's section gradient over the
    /// full screen, safe areas included.
    func networkBackground() -> some View {
        background(Theme.groundGradient.ignoresSafeArea())
    }
}
