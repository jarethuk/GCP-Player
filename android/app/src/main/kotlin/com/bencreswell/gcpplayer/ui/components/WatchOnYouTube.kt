package com.bencreswell.gcpplayer.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OndemandVideo
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/**
 * The episode's video version, handed to YouTube's own app rather than played
 * here.
 *
 * YouTube's terms rule out downloading, separating the audio track from the
 * video, and background playback — which is to say all three of the things this
 * app exists to do. An embedded player would stop the moment the screen locked,
 * could never be held for a tunnel, and would never reach Android Auto; on a
 * three-hour actual-play episode that reads as a bug rather than a limitation.
 * Handing off costs one tap and gives the viewer picture-in-picture, casting,
 * their own history and their own subscription.
 *
 * Roughly half the catalogue has one. Nothing before 2020 was filmed, and Blood
 * of the Wild and GCN News Minute never are — so every one of these composables
 * draws nothing at all rather than offering a button that would go nowhere.
 */
val EpisodeEntity.videoLink: String?
    get() = videoUrl?.takeIf { it.isNotBlank() }

/**
 * The video, starting where the listener has got to.
 *
 * Close rather than exact. A public episode's audio carries ads the video
 * doesn't, so it runs ahead of the picture by however many have played;
 * Patreon's ad-free copy lines up far better. Either way it lands the viewer
 * near the right scene rather than at the table-talk before it.
 */
fun EpisodeEntity.videoLinkAt(seconds: Double): String? =
    videoLink?.let { youTubeLink(it, seconds) }

/**
 * [link] with YouTube's `t=` start time — replacing any the feed's link already
 * carried. The first few seconds aren't worth a jump, and a finished episode's
 * position is 0, so both open at the start.
 */
fun youTubeLink(link: String, seconds: Double): String {
    val uri = runCatching { link.toUri() }.getOrNull() ?: return link
    val builder = uri.buildUpon().clearQuery()
    for (name in uri.queryParameterNames) {
        if (name == "t" || name == "start") continue
        for (value in uri.getQueryParameters(name)) builder.appendQueryParameter(name, value)
    }
    if (seconds >= 5) builder.appendQueryParameter("t", seconds.toLong().toString())
    return builder.build().toString()
}

/**
 * The outlined secondary style, the same one PLAY NEXT EPISODE wears: this is
 * an alternative to playing, not the thing the screen is for.
 */
@Composable
fun WatchOnYouTubeButton(
    episode: EpisodeEntity,
    /** Where the listener has got to: the player's position if it holds this episode. */
    positionSeconds: Double = episode.positionSeconds,
    modifier: Modifier = Modifier,
) {
    val link = episode.videoLinkAt(positionSeconds) ?: return
    val uriHandler = LocalUriHandler.current
    val description = stringResource(R.string.youtube_a11y_watch)

    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, GcpColors.Line, RoundedCornerShape(8.dp))
            // A device with neither YouTube nor a browser has nothing to answer
            // an https intent, and the throw would take the app down from a
            // button tap. Vanishingly rare, and cheap to refuse instead.
            .clickable { runCatching { uriHandler.openUri(link) } }
            .padding(vertical = 11.dp)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Filled.OndemandVideo,
                contentDescription = null,
                tint = GcpColors.Sky,
                modifier = Modifier.size(15.dp),
            )
            Text(
                stringResource(R.string.youtube_watch).uppercase(),
                style = GcpType.meta(size = 10f, tracking = 1.8f),
                color = GcpColors.Sky,
            )
        }
    }
}

/**
 * The same destination as a menu row, for the "⋮" menu on a list row — so
 * reaching the video doesn't mean opening the episode first.
 */
@Composable
fun WatchOnYouTubeMenuItem(episode: EpisodeEntity, onDismiss: () -> Unit) {
    // The saved position — at most five seconds behind a playing episode,
    // which the service writes back as it goes.
    val link = episode.videoLinkAt(episode.positionSeconds) ?: return
    val uriHandler = LocalUriHandler.current

    DropdownMenuItem(
        text = { Text(stringResource(R.string.youtube_watch), style = GcpType.body(14f)) },
        leadingIcon = { Icon(Icons.Filled.OndemandVideo, null, tint = GcpColors.Sky) },
        onClick = {
            onDismiss()
            runCatching { uriHandler.openUri(link) }
        },
    )
}
