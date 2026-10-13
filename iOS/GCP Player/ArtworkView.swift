//
//  ArtworkView.swift
//  GCP Player
//
//  Remote podcast artwork, fetched at the size it will actually be drawn
//  at and kept as a thumbnail from then on.
//
//  Why not AsyncImage: the feed's artwork is 3000×3000 (Megaphone caps it
//  there). AsyncImage hands that to SwiftUI at full size, so a 56pt row
//  thumbnail costs a ~36 MB bitmap, decoded on the main thread as the row
//  scrolls into view — and again every time it comes back, since
//  AsyncImage keeps nothing. That is what makes the lists stutter.
//
//  What the originals cost, measured: 660 KB on megaphone.imgix.net,
//  1.08 MB on assets.pippa.io (acast), 1.49 MB on cloudfront (anchor).
//  Two things keep that off the wire:
//
//  1. Megaphone serves through imgix, which will render the thumbnail for
//     us — asking for w=168 returns 8 KB instead of 660 KB. The other two
//     hosts ignore resize parameters, so they still send the original,
//     once.
//  2. Whatever arrives is downsampled and the *small* version written to
//     disk, so the next launch reads ~10 KB locally rather than fetching
//     megabytes again.
//

import SwiftUI
import CryptoKit
import ImageIO
import UIKit

/// Fetches artwork at the size it's needed, downsamples it off the main
/// thread, and keeps the small result in memory and on disk.
enum ArtworkLoader {
    // NSCache is thread-safe and evicts itself under memory pressure, which
    // is exactly the policy we want for decoded images — and why the decode
    // tasks can touch it from off the main actor, which is what the
    // nonisolated(unsafe) says.
    nonisolated(unsafe) private static let cache = NSCache<NSString, UIImage>()

    /// Thumbnails live in Application Support, not Caches: the network adds
    /// a show every few months and the covers never change, so re-fetching
    /// megabytes because the system wanted a few kilobytes back is a bad
    /// trade. Excluded from backup, since they can be fetched again if the
    /// device is ever restored.
    nonisolated private static let directory: URL? = {
        #if os(tvOS)
        // Caches is all Apple TV lets an app keep, so the argument above
        // doesn't arise: a purge costs one re-fetch per cover.
        guard let caches = try? FileManager.default.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return nil }
        let directory = caches.appending(path: "Artwork", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
        #else
        guard let base = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return nil }
        var directory = base.appending(path: "Artwork", directoryHint: .isDirectory)

        // Adopt anything the old Caches location still holds rather than
        // re-downloading it.
        if !FileManager.default.fileExists(atPath: directory.path),
           let caches = try? FileManager.default.url(
               for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false
           ) {
            let previous = caches.appending(path: "Artwork", directoryHint: .isDirectory)
            if FileManager.default.fileExists(atPath: previous.path) {
                try? FileManager.default.moveItem(at: previous, to: directory)
            }
        }

        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? directory.setResourceValues(values)
        return directory
        #endif
    }()

    /// `pixelSize` is the longest edge we need, in *pixels* (points ×
    /// screen scale) — cached separately per size, so the 40pt mini-player
    /// thumbnail doesn't force the 250pt now-playing art to reload.
    static func image(for urlString: String, pixelSize: CGFloat) async -> UIImage? {
        let pixels = Int(pixelSize.rounded())
        let key = "\(urlString)|\(pixels)"
        if let cached = cache.object(forKey: key as NSString) { return cached }

        // The disk read and the decode both belong off the main actor.
        // A bigger copy of the same artwork counts as a hit: shrinking one
        // we already hold beats another megabyte off the network, and it's
        // what makes an episode downloaded for offline show its art at
        // every size.
        if let stored = await Task.detached(priority: .utility, operation: {
            storedImage(url: urlString, pixels: pixels)
        }).value {
            cache.setObject(stored, forKey: key as NSString)
            return stored
        }

        guard let url = remoteURL(urlString, pixelSize: pixelSize),
              let (data, _) = try? await URLSession.shared.data(from: url)
        else { return nil }

        // Off the main actor: decoding is the expensive part, not the download.
        let decoded = await Task.detached(priority: .utility) { () -> UIImage? in
            guard let image = downsample(data, maxPixelSize: pixelSize) else { return nil }
            store(image, url: urlString, pixels: pixels)
            return image
        }.value
        guard let image = decoded else { return nil }

        cache.setObject(image, forKey: key as NSString)
        return image
    }

    /// Where we ask the CDN for the thumbnail rather than the original.
    /// Only imgix hosts honour this; everything else gets the URL as the
    /// feed published it, so a host that ignores the query string isn't
    /// handed one that might confuse its cache.
    private static func remoteURL(_ urlString: String, pixelSize: CGFloat) -> URL? {
        guard var components = URLComponents(string: urlString) else { return nil }
        guard components.host?.hasSuffix("imgix.net") == true else { return URL(string: urlString) }

        let edge = String(Int(pixelSize.rounded()))
        // max-w/max-h cap the original; w/h actually resize it.
        var items = (components.queryItems ?? []).filter {
            !["max-w", "max-h", "w", "h"].contains($0.name)
        }
        items.append(URLQueryItem(name: "w", value: edge))
        items.append(URLQueryItem(name: "h", value: edge))
        if !items.contains(where: { $0.name == "fit" }) {
            items.append(URLQueryItem(name: "fit", value: "crop"))
        }
        components.queryItems = items
        return components.url
    }

    // MARK: - Disk

    /// `<hash of the URL>-<pixels>.jpg`. The URL is hashed so its query
    /// string and slashes can't escape into the filename; the size stays
    /// readable so the sizes we hold for one image can be found by name.
    nonisolated private static func fileName(url: String, pixels: Int) -> String {
        let digest = SHA256.hash(data: Data(url.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return "\(digest)-\(pixels).jpg"
    }

    nonisolated private static func storedImage(url urlString: String, pixels: Int) -> UIImage? {
        guard let directory else { return nil }

        let exact = directory.appending(path: fileName(url: urlString, pixels: pixels))
        if let data = try? Data(contentsOf: exact) { return UIImage(data: data) }

        // Nothing at this size — look for a larger one of the same image.
        let prefix = String(fileName(url: urlString, pixels: 0).dropLast("-0.jpg".count))
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil, options: .skipsHiddenFiles
        )) ?? []

        let candidates = files.compactMap { file -> (URL, Int)? in
            let name = file.deletingPathExtension().lastPathComponent
            guard name.hasPrefix(prefix),
                  let size = Int(name.dropFirst(prefix.count + 1)),
                  size >= pixels
            else { return nil }
            return (file, size)
        }

        // The smallest one that still covers the size asked for.
        guard let source = candidates.min(by: { $0.1 < $1.1 })?.0,
              let data = try? Data(contentsOf: source),
              let image = downsample(data, maxPixelSize: CGFloat(pixels))
        else { return nil }

        store(image, url: urlString, pixels: pixels)
        return image
    }

    /// Writes the *downsampled* image, not the original — a row thumbnail
    /// lands at around 10 KB.
    nonisolated private static func store(_ image: UIImage, url: String, pixels: Int) {
        guard let directory,
              let data = image.jpegData(compressionQuality: 0.85)
        else { return }
        try? data.write(to: directory.appending(path: fileName(url: url, pixels: pixels)), options: .atomic)
    }

    /// Decodes straight to a thumbnail: ImageIO never materialises the
    /// full-size bitmap, so peak memory stays small too.
    nonisolated private static func downsample(_ data: Data, maxPixelSize: CGFloat) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            // Decode now, on this background task, rather than lazily on
            // the main thread at draw time.
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        else { return nil }
        return UIImage(cgImage: thumbnail)
    }
}

/// Square artwork with a placeholder while it loads — list rows, the mini
/// player, the episode and now-playing screens.
struct ArtworkView: View {
    let urlString: String?
    let size: CGFloat

    @Environment(\.displayScale) private var displayScale
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable()
            } else {
                RoundedRectangle(cornerRadius: size / 7)
                    .fill(Theme.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: size / 7)
                            .strokeBorder(Theme.line, lineWidth: 1)
                    }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size / 7))
        // Re-runs when the row is reused for a different show.
        .task(id: urlString) {
            image = nil
            guard let urlString else { return }
            image = await ArtworkLoader.image(for: urlString, pixelSize: size * displayScale)
        }
    }
}

/// Artwork that fills a rectangle rather than a square — the show screen's
/// stretchy hero header.
struct WideArtworkView: View {
    let urlString: String?
    /// Longest edge to decode to, in points.
    let renderSize: CGFloat

    @Environment(\.displayScale) private var displayScale
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Rectangle().fill(Theme.surface)
            }
        }
        .task(id: urlString) {
            image = nil
            guard let urlString else { return }
            image = await ArtworkLoader.image(for: urlString, pixelSize: renderSize * displayScale)
        }
    }
}
