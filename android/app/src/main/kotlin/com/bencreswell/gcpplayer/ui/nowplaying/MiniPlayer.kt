package com.bencreswell.gcpplayer.ui.nowplaying

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.playback.PlaybackState
import com.bencreswell.gcpplayer.ui.components.Artwork
import com.bencreswell.gcpplayer.ui.components.GradientPlayButton
import com.bencreswell.gcpplayer.ui.components.Hairline
import com.bencreswell.gcpplayer.ui.theme.AccentGradient
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/** The compact "now playing" bar pinned to the bottom of every screen. */
@Composable
fun MiniPlayer(
    state: PlaybackState,
    onTogglePlayPause: () -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val progress = if (state.durationSeconds > 0) {
        (state.positionSeconds / state.durationSeconds).coerceIn(0.0, 1.0).toFloat()
    } else 0f

    Column(
        modifier
            .fillMaxWidth()
            // The system's own bar colour reads grey against the navy, so
            // the bar mixes its own: ink, near-opaque.
            .background(GcpColors.InkDeep.copy(alpha = 0.97f))
            .clickable(onClick = onOpen),
    ) {
        Hairline()
        Box(Modifier.fillMaxWidth().height(2.dp).background(GcpColors.Sky.copy(alpha = 0.16f))) {
            Box(Modifier.fillMaxWidth(progress).fillMaxHeight().background(AccentGradient))
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Artwork(state.artworkUrl, 40.dp, cornerRadius = 6.dp)
            Column(Modifier.weight(1f)) {
                Text(
                    state.episode?.title ?: stringResource(R.string.player_nothing_playing),
                    style = GcpType.bold(13f),
                    color = GcpColors.Bone,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    state.showTitle.orEmpty(),
                    style = GcpType.body(10.5f),
                    color = GcpColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            GradientPlayButton(state.isPlaying, onTogglePlayPause, size = 32)
        }
    }
}
