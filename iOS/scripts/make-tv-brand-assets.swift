// Builds the tvOS "App Icon & Top Shelf Image" brand assets from the iOS icon.
//
//   cd iOS && swiftc -O scripts/make-tv-brand-assets.swift -o /tmp/make-tv-brand-assets && \
//   /tmp/make-tv-brand-assets \
//     "GCP Player/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png" "GCP Player/Fonts" \
//     "GCP Player TV/Assets.xcassets/App Icon & Top Shelf Image.brandassets"
//
// Rerun it whenever the iOS icon changes. Compiled rather than run with
// `swift`: the pixel loops take minutes unoptimised.
//
// The icon is split by colour into three parallax layers:
//   Back   – the network's ground gradient, regenerated (opaque).
//   Middle – the d20, with the part the ring hides filled in, so parallax
//            never opens a hole behind the ring.
//   Front  – the ring, carrying its own navy keyline, so the cut-out between
//            ring and die moves with the ring.

import AppKit
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let iconURL = URL(fileURLWithPath: args[1])
let fontsDir = URL(fileURLWithPath: args[2])
let out = URL(fileURLWithPath: args[3])

// MARK: - Pixels

struct RGBA { var r, g, b, a: Double }

final class Bitmap {
    let w: Int, h: Int
    var px: [RGBA]
    init(w: Int, h: Int) { self.w = w; self.h = h; px = Array(repeating: RGBA(r: 0, g: 0, b: 0, a: 0), count: w * h) }
    subscript(x: Int, y: Int) -> RGBA {
        get { px[y * w + x] }
        set { px[y * w + x] = newValue }
    }

    static func load(_ url: URL) -> Bitmap {
        let src = CGImageSourceCreateWithURL(url as CFURL, nil)!
        let image = CGImageSourceCreateImageAtIndex(src, 0, nil)!
        let w = image.width, h = image.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        let b = Bitmap(w: w, h: h)
        for i in 0..<(w * h) {
            let a = Double(data[i * 4 + 3]) / 255
            let un = a > 0 ? 1 / a : 0
            b.px[i] = RGBA(r: Double(data[i * 4]) / 255 * un, g: Double(data[i * 4 + 1]) / 255 * un,
                           b: Double(data[i * 4 + 2]) / 255 * un, a: a)
        }
        return b
    }

    /// Straight-alpha pixels to a CGImage (row 0 at the top).
    func cgImage() -> CGImage {
        var data = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0..<(w * h) {
            let p = px[i]
            let a = max(0, min(1, p.a))
            data[i * 4] = UInt8(max(0, min(1, p.r)) * a * 255 + 0.5)
            data[i * 4 + 1] = UInt8(max(0, min(1, p.g)) * a * 255 + 0.5)
            data[i * 4 + 2] = UInt8(max(0, min(1, p.b)) * a * 255 + 0.5)
            data[i * 4 + 3] = UInt8(a * 255 + 0.5)
        }
        let provider = CGDataProvider(data: Data(data) as CFData)!
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                       space: CGColorSpace(name: CGColorSpace.sRGB)!,
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)!
    }
}

func hex(_ v: UInt32) -> RGBA {
    RGBA(r: Double((v >> 16) & 0xFF) / 255, g: Double((v >> 8) & 0xFF) / 255, b: Double(v & 0xFF) / 255, a: 1)
}

// MARK: - Split the icon

let icon = Bitmap.load(iconURL)
let W = icon.w, H = icon.h

// The icon's own ground, sampled at the corners and interpolated — only used
// to tell logo from background, never drawn.
func patch(_ cx: Int, _ cy: Int) -> RGBA {
    var s = RGBA(r: 0, g: 0, b: 0, a: 0); var n = 0.0
    for y in (cy - 8)...(cy + 8) { for x in (cx - 8)...(cx + 8) {
        let p = icon[x, y]; s.r += p.r; s.g += p.g; s.b += p.b; n += 1
    } }
    return RGBA(r: s.r / n, g: s.g / n, b: s.b / n, a: 1)
}
let c00 = patch(24, 24), c10 = patch(W - 25, 24), c01 = patch(24, H - 25), c11 = patch(W - 25, H - 25)
func ground(_ x: Int, _ y: Int) -> RGBA {
    let u = Double(x) / Double(W - 1), v = Double(y) / Double(H - 1)
    func mix(_ a: Double, _ b: Double, _ c: Double, _ d: Double) -> Double {
        (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
    }
    return RGBA(r: mix(c00.r, c10.r, c01.r, c11.r), g: mix(c00.g, c10.g, c01.g, c11.g),
                b: mix(c00.b, c10.b, c01.b, c11.b), a: 1)
}

let ring = Bitmap(w: W, h: H), die = Bitmap(w: W, h: H)
for y in 0..<H { for x in 0..<W {
    let p = icon[x, y], g = ground(x, y)
    let d = sqrt(pow(p.r - g.r, 2) + pow(p.g - g.g, 2) + pow(p.b - g.b, 2))
    // Soft matte: anti-aliased edges come out partially transparent.
    let a = max(0, min(1, (d - 0.07) / 0.14))
    guard a > 0 else { continue }
    // Un-mix the edge pixel from the ground to recover the logo's own colour.
    let un = RGBA(r: (p.r - g.r * (1 - a)) / a, g: (p.g - g.g * (1 - a)) / a, b: (p.b - g.b * (1 - a)) / a, a: a)
    if un.r > un.b { ring[x, y] = un } else { die[x, y] = un }
}}

// Drop specks: a soft pixel stays only if it is the edge of something solid.
func despeckle(_ layer: Bitmap) {
    let solid = layer.px.map { $0.a > 0.9 }
    for y in 2..<(H - 2) { for x in 2..<(W - 2) where layer[x, y].a > 0 && layer[x, y].a < 0.9 {
        var edge = false
        outer: for dy in -2...2 { for dx in -2...2 where solid[(y + dy) * W + x + dx] { edge = true; break outer } }
        if !edge { layer[x, y] = RGBA(r: 0, g: 0, b: 0, a: 0) }
    }}
}
despeckle(ring)
despeckle(die)

// The die's silhouette: the convex hull of its solid pixels. Its facets are
// separated by navy gaps and crossed by the ring, but its outline is convex.
var extremes: [(Double, Double)] = []
for y in 0..<H {
    var lo = Int.max, hi = Int.min
    for x in 0..<W where die[x, y].a > 0.9 && die[x, y].b > die[x, y].r + 0.3 { lo = min(lo, x); hi = max(hi, x) }
    if lo <= hi { extremes.append((Double(lo), Double(y))); extremes.append((Double(hi), Double(y))) }
}
func cross(_ o: (Double, Double), _ a: (Double, Double), _ b: (Double, Double)) -> Double {
    (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
}
// Andrew's monotone chain.
let sorted = extremes.sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
var lower: [(Double, Double)] = [], upper: [(Double, Double)] = []
for p in sorted {
    while lower.count >= 2 && cross(lower[lower.count - 2], lower[lower.count - 1], p) <= 0 { lower.removeLast() }
    lower.append(p)
}
for p in sorted.reversed() {
    while upper.count >= 2 && cross(upper[upper.count - 2], upper[upper.count - 1], p) <= 0 { upper.removeLast() }
    upper.append(p)
}
let hull = Array(lower.dropLast() + upper.dropLast())
print("die hull: \(hull.count) points")
var insideMask = [Bool](repeating: false, count: W * H)
for y in 0..<H { for x in 0..<W {
    let p = (Double(x), Double(y))
    var inside = true
    for i in 0..<hull.count where cross(hull[i], hull[(i + 1) % hull.count], p) < -0.5 { inside = false; break }
    insideMask[y * W + x] = inside
}}
func insideDie(_ x: Int, _ y: Int) -> Bool { insideMask[y * W + x] }

// Everything within `keyline` of the ring: the ring's navy cut-out.
let keyline = 12
var nearRing = [Bool](repeating: false, count: W * H)
var offsets: [(Int, Int)] = []
for dy in -keyline...keyline { for dx in -keyline...keyline where dx * dx + dy * dy <= keyline * keyline {
    offsets.append((dx, dy))
}}
for y in 1..<(H - 1) { for x in 1..<(W - 1) where ring[x, y].a > 0.5 {
    // Boundary pixels only — the interior is covered by its neighbours.
    guard ring[x - 1, y].a < 0.5 || ring[x + 1, y].a < 0.5 || ring[x, y - 1].a < 0.5 || ring[x, y + 1].a < 0.5
    else { nearRing[y * W + x] = true; continue }
    for (dx, dy) in offsets {
        let nx = x + dx, ny = y + dy
        if nx >= 0, ny >= 0, nx < W, ny < H { nearRing[ny * W + nx] = true }
    }
}}

// Fill the die under the ring, from the nearest solid die pixel on the row.
let solidDie = (0..<(W * H)).map { i in
    let p = die.px[i]
    return p.a > 0.95 && p.b > p.r + 0.3 && !nearRing[i]
}
for y in 0..<H { for x in 0..<W where nearRing[y * W + x] && insideDie(x, y) {
    var best: RGBA?
    for r in 1..<90 {
        if x - r >= 0, solidDie[y * W + x - r] { best = die[x - r, y]; break }
        if x + r < W, solidDie[y * W + x + r] { best = die[x + r, y]; break }
    }
    if let best { die[x, y] = RGBA(r: best.r, g: best.g, b: best.b, a: 1) }
}}

for y in 0..<H { for x in 0..<W where !insideDie(x, y) && die[x, y].a > 0 {
    die[x, y] = RGBA(r: 0, g: 0, b: 0, a: 0)
}}

// The ring's keyline, where it crosses the die, in the ground's own colour.
let keylineColour = RGBA(r: (c00.r + c11.r) / 2, g: (c00.g + c11.g) / 2, b: (c00.b + c11.b) / 2, a: 1)
for y in 0..<H { for x in 0..<W where nearRing[y * W + x] && insideDie(x, y) {
    let p = ring[x, y]
    // Composite the ring over its keyline so edges stay anti-aliased.
    ring[x, y] = RGBA(r: p.r * p.a + keylineColour.r * (1 - p.a), g: p.g * p.a + keylineColour.g * (1 - p.a),
                      b: p.b * p.a + keylineColour.b * (1 - p.a), a: 1)
}}

// The mark's bounds in the source.
var minX = W, maxX = 0, minY = H, maxY = 0
for y in 0..<H { for x in 0..<W where ring[x, y].a > 0.1 || die[x, y].a > 0.1 {
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
}}
let markRect = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
print("mark bounds in source: \(markRect)")

let ringImage = ring.cgImage().cropping(to: markRect)!
let dieImage = die.cgImage().cropping(to: markRect)!

// MARK: - Drawing

let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

func canvas(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> CGImage {
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: srgb,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.interpolationQuality = .high
    // Top-left origin, like every layout number below.
    ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: 1, y: -1)
    draw(ctx)
    return ctx.makeImage()!
}

/// Theme.groundGradient: #03253F → #043559 at the site's 115.55°.
func drawGround(_ ctx: CGContext, _ w: CGFloat, _ h: CGFloat) {
    let colours = [CGColor(srgbRed: 0x03 / 255, green: 0x25 / 255, blue: 0x3F / 255, alpha: 1),
                   CGColor(srgbRed: 0x04 / 255, green: 0x35 / 255, blue: 0x59 / 255, alpha: 1)] as CFArray
    let gradient = CGGradient(colorsSpace: srgb, colors: colours, locations: [0.076, 0.759])!
    // CSS angles run clockwise from "to top": direction (sin θ, cos θ) in a
    // y-down frame is (sin θ, -cos θ) flipped, i.e. (0.902, 0.431).
    let θ = 115.55 * Double.pi / 180
    let dx = sin(θ), dy = -cos(θ)
    let half = (abs(Double(w) * dx) + abs(Double(h) * dy)) / 2
    let c = CGPoint(x: w / 2, y: h / 2)
    ctx.drawLinearGradient(gradient,
                           start: CGPoint(x: c.x - CGFloat(dx * half), y: c.y - CGFloat(dy * half)),
                           end: CGPoint(x: c.x + CGFloat(dx * half), y: c.y + CGFloat(dy * half)),
                           options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
}

/// Draws a cropped mark layer into `rect` (top-left origin), right way up.
func drawMark(_ ctx: CGContext, _ image: CGImage, in rect: CGRect) {
    ctx.saveGState()
    ctx.translateBy(x: rect.minX, y: rect.maxY); ctx.scaleBy(x: 1, y: -1)
    ctx.draw(image, in: CGRect(origin: .zero, size: rect.size))
    ctx.restoreGState()
}

func write(_ image: CGImage, _ url: URL) {
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    precondition(CGImageDestinationFinalize(dest))
}

func writeJSON(_ object: Any, _ url: URL) {
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
    try! data.write(to: url)
}

let info: [String: Any] = ["author": "xcode", "version": 1]

// MARK: - App icon stacks

/// The mark, centred, `fraction` of the canvas height tall. Kept inside the
/// middle of the icon because tvOS scales layers up as they tilt.
func markRectFor(_ w: CGFloat, _ h: CGFloat, fraction: CGFloat) -> CGRect {
    let mh = h * fraction, mw = mh * markRect.width / markRect.height
    return CGRect(x: (w - mw) / 2, y: (h - mh) / 2, width: mw, height: mh)
}

func imageStack(_ name: String, sizes: [(scale: String, w: Int, h: Int)]) {
    let stack = out.appending(path: "\(name).imagestack")
    let layers: [(String, (CGContext, CGFloat, CGFloat) -> Void)] = [
        ("Front", { ctx, w, h in drawMark(ctx, ringImage, in: markRectFor(w, h, fraction: 0.64)) }),
        ("Middle", { ctx, w, h in drawMark(ctx, dieImage, in: markRectFor(w, h, fraction: 0.64)) }),
        ("Back", { ctx, w, h in drawGround(ctx, w, h) }),
    ]
    for (layer, draw) in layers {
        let set = stack.appending(path: "\(layer).imagestacklayer/Content.imageset")
        var images: [[String: Any]] = []
        for size in sizes {
            let file = "\(layer)-\(size.w)x\(size.h).png"
            write(canvas(size.w, size.h) { draw($0, CGFloat(size.w), CGFloat(size.h)) }, set.appending(path: file))
            images.append(["filename": file, "idiom": "tv", "scale": size.scale])
        }
        writeJSON(["images": images, "info": info], set.appending(path: "Contents.json"))
        writeJSON(["info": info], stack.appending(path: "\(layer).imagestacklayer/Contents.json"))
    }
    writeJSON(["info": info, "layers": layers.map { ["filename": "\($0.0).imagestacklayer"] }],
              stack.appending(path: "Contents.json"))
}

imageStack("App Icon", sizes: [("1x", 400, 240), ("2x", 800, 480)])
imageStack("App Icon - App Store", sizes: [("1x", 1280, 768)])

// MARK: - Top Shelf

for file in ["ArchivoBlack-Regular.ttf", "OpenSans-Bold.ttf"] {
    CTFontManagerRegisterFontsForURL(fontsDir.appending(path: file) as CFURL, .process, nil)
}

func line(_ text: String, font: String, size: CGFloat, colour: CGColor, tracking: CGFloat = 0) -> CTLine {
    let attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName(font as CFString, size, nil),
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): colour,
        NSAttributedString.Key(kCTKernAttributeName as String): tracking,
    ]
    return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
}

func drawLine(_ ctx: CGContext, _ l: CTLine, x: CGFloat, baseline: CGFloat) {
    ctx.saveGState()
    // CoreText draws y-up; flip locally around the baseline.
    ctx.translateBy(x: x, y: baseline); ctx.scaleBy(x: 1, y: -1)
    ctx.textPosition = .zero
    CTLineDraw(l, ctx)
    ctx.restoreGState()
}

let bone = CGColor(srgbRed: 0xEA / 255, green: 0xF2 / 255, blue: 0xF8 / 255, alpha: 1)
let sky = CGColor(srgbRed: 0x7C / 255, green: 0xC0 / 255, blue: 0xDF / 255, alpha: 1)

/// The mark, then the name in the display face, the tracked label under it,
/// and the site's gradient rule — the app's own header treatment, as a
/// group centred on the canvas.
func topShelf(_ w: Int, _ h: Int) -> CGImage {
    canvas(w, h) { ctx in
        let W = CGFloat(w), H = CGFloat(h)
        drawGround(ctx, W, H)

        let markH = H * 0.46
        let markW = markH * markRect.width / markRect.height
        let gap = H * 0.09

        let title = line("GCP PLAYER", font: "ArchivoBlack-Regular", size: H * 0.19, colour: bone, tracking: H * 0.002)
        let label = line("EVERY SHOW, IN LISTENING ORDER", font: "OpenSans-Bold", size: H * 0.042, colour: sky, tracking: H * 0.012)
        let titleW = CGFloat(CTLineGetTypographicBounds(title, nil, nil, nil))
        let labelW = CGFloat(CTLineGetTypographicBounds(label, nil, nil, nil))
        let textW = max(titleW, labelW)

        let groupW = markW + gap + textW
        let x0 = (W - groupW) / 2
        let markRect = CGRect(x: x0, y: (H - markH) / 2, width: markW, height: markH)
        drawMark(ctx, dieImage, in: markRect)
        drawMark(ctx, ringImage, in: markRect)

        let tx = x0 + markW + gap
        let titleBaseline = H * 0.5 + H * 0.045
        drawLine(ctx, title, x: tx, baseline: titleBaseline)
        drawLine(ctx, label, x: tx + H * 0.004, baseline: titleBaseline + H * 0.095)

        // The gradient rule, 56:3 as in the app, scaled.
        let rule = CGRect(x: tx + H * 0.004, y: titleBaseline + H * 0.14, width: H * 0.16, height: H * 0.009)
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: rule, cornerWidth: rule.height / 2, cornerHeight: rule.height / 2, transform: nil))
        ctx.clip()
        let stops: [UInt32] = [0x66C4EF, 0x47A2D2, 0x00548E]
        let accent = stops.map { v -> CGColor in
            let c = hex(v)
            return CGColor(srgbRed: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: 1)
        } as CFArray
        ctx.drawLinearGradient(CGGradient(colorsSpace: srgb, colors: accent, locations: [0.145, 0.435, 0.851])!,
                               start: CGPoint(x: rule.minX, y: rule.minY), end: CGPoint(x: rule.maxX, y: rule.maxY),
                               options: [])
        ctx.restoreGState()
    }
}

func shelf(_ name: String, sizes: [(scale: String, w: Int, h: Int)]) {
    let set = out.appending(path: "\(name).imageset")
    var images: [[String: Any]] = []
    for size in sizes {
        let file = "\(name.replacingOccurrences(of: " ", with: ""))-\(size.w)x\(size.h).png"
        write(topShelf(size.w, size.h), set.appending(path: file))
        images.append(["filename": file, "idiom": "tv", "scale": size.scale])
    }
    writeJSON(["images": images, "info": info], set.appending(path: "Contents.json"))
}

shelf("Top Shelf Image", sizes: [("1x", 1920, 720), ("2x", 3840, 1440)])
shelf("Top Shelf Image Wide", sizes: [("1x", 2320, 720), ("2x", 4640, 1440)])

// MARK: - The brand assets set

writeJSON([
    "assets": [
        ["filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"],
        ["filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"],
        ["filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"],
        ["filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"],
    ],
    "info": info,
], out.appending(path: "Contents.json"))

print("done")
