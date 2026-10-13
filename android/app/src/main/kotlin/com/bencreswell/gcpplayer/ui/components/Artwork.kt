package com.bencreswell.gcpplayer.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.bencreswell.gcpplayer.data.artwork.artworkUrl
import com.bencreswell.gcpplayer.ui.theme.GcpColors

/**
 * Remote podcast artwork, asked for at the size it will actually be drawn.
 *
 * The feed's covers are 3000×3000 — 660 KB to 1.5 MB each. Coil downsamples
 * to the target and keeps both a memory and a disk cache, which is most of
 * what the iOS app's hand-rolled `ArtworkLoader` exists to do; the imgix
 * rewrite in [artworkUrl] is the other half, and saves the megabyte before
 * it is ever sent.
 */
@Composable
fun Artwork(
    urlString: String?,
    size: Dp,
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 8.dp,
) {
    val pixels = with(LocalDensity.current) { size.toPx().toInt() }
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .background(GcpColors.Surface)
    ) {
        RemoteArtwork(urlString, pixels, Modifier.size(size))
    }
}

/**
 * The same image filling whatever it's given — the show screen's hero,
 * where a square source has to cover a full-width rectangle.
 */
@Composable
fun WideArtwork(urlString: String?, renderPixels: Int, modifier: Modifier = Modifier) {
    Box(modifier.background(GcpColors.Ink)) {
        RemoteArtwork(urlString, renderPixels, Modifier.matchParentSize())
    }
}

@Composable
private fun RemoteArtwork(urlString: String?, pixels: Int, modifier: Modifier) {
    val url = artworkUrl(urlString, pixels)
    if (url == null) return
    AsyncImage(
        model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
            .data(url)
            .size(pixels)
            .crossfade(true)
            .build(),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier,
    )
}
