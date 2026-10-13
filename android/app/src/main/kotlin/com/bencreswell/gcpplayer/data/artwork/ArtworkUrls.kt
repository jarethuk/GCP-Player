package com.bencreswell.gcpplayer.data.artwork

import androidx.core.net.toUri

/**
 * Asks the CDN for a thumbnail instead of the original.
 *
 * The feed's artwork is 3000×3000 — Megaphone caps it there — and costs
 * 660 KB on megaphone.imgix.net, 1.08 MB on assets.pippa.io (acast) and
 * 1.49 MB on cloudfront (anchor), measured. Megaphone serves through imgix,
 * which will render the thumbnail for us: asking for w=168 returns 8 KB
 * instead of 660 KB.
 *
 * Only imgix hosts honour this. Everything else gets the URL exactly as the
 * feed published it, so a host that ignores the query string isn't handed
 * one that might confuse its cache — Coil downsamples and caches whatever
 * arrives, so the megabyte is paid once rather than on every scroll.
 */
fun artworkUrl(urlString: String?, pixelSize: Int): String? {
    if (urlString.isNullOrEmpty()) return null
    val uri = runCatching { urlString.toUri() }.getOrNull() ?: return urlString
    if (uri.host?.endsWith("imgix.net") != true) return urlString

    val edge = pixelSize.toString()
    val builder = uri.buildUpon().clearQuery()
    var hasFit = false
    for (name in uri.queryParameterNames) {
        // max-w/max-h cap the original; w/h actually resize it.
        if (name in setOf("max-w", "max-h", "w", "h")) continue
        if (name == "fit") hasFit = true
        uri.getQueryParameters(name).forEach { builder.appendQueryParameter(name, it) }
    }
    builder.appendQueryParameter("w", edge)
    builder.appendQueryParameter("h", edge)
    if (!hasFit) builder.appendQueryParameter("fit", "crop")
    return builder.build().toString()
}
