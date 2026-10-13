package com.bencreswell.gcpplayer.ui.nowplaying

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.playback.PlaybackState
import com.bencreswell.gcpplayer.playback.formatTime
import com.bencreswell.gcpplayer.ui.components.Artwork
import com.bencreswell.gcpplayer.ui.components.DownloadIndicator
import com.bencreswell.gcpplayer.ui.components.GradientPlayButton
import com.bencreswell.gcpplayer.ui.components.MetaLabel
import com.bencreswell.gcpplayer.ui.components.SkipButton
import com.bencreswell.gcpplayer.ui.components.WatchOnYouTubeButton
import com.bencreswell.gcpplayer.playback.DownloadStatus
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType
import com.bencreswell.gcpplayer.ui.theme.GroundGradient

/** The full-screen player, opened by tapping the mini bar. */
@Composable
fun NowPlayingScreen(
    state: PlaybackState,
    scrubSeconds: Double?,
    downloadStatus: DownloadStatus?,
    hasNext: Boolean,
    onTogglePlayPause: () -> Unit,
    onSkip: (Double) -> Unit,
    onScrub: (Double) -> Unit,
    onSeek: (Double) -> Unit,
    onPlayNext: () -> Unit,
    onGoToShow: (String) -> Unit,
) {
    val displayTime = scrubSeconds ?: state.positionSeconds
    val duration = state.durationSeconds.coerceAtLeast(1.0)

    Column(
        Modifier
            .fillMaxSize()
            .background(GroundGradient)
            .padding(horizontal = 26.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Artwork(state.artworkUrl, 250.dp, cornerRadius = 10.dp)
        Spacer(Modifier.height(22.dp))

        Text(
            (state.episode?.title ?: stringResource(R.string.player_nothing_playing)).uppercase(),
            style = GcpType.display(21f),
            color = GcpColors.Bone,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(6.dp))

        val showTitle = state.showTitle
        val showSlug = state.showSlug
        if (showTitle != null && showSlug != null) {
            Row(
                Modifier.clickable { onGoToShow(showSlug) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                MetaLabel(showTitle, showsTick = false, color = GcpColors.Sky)
                Icon(
                    Icons.Filled.ChevronRight,
                    contentDescription = stringResource(R.string.player_a11y_go_to_show, showTitle),
                    tint = GcpColors.Sky,
                    modifier = Modifier.size(14.dp),
                )
            }
        }

        state.positionInShow?.let { position ->
            Spacer(Modifier.height(6.dp))
            val positionDescription =
                stringResource(R.string.player_a11y_position_in_show, position.index, position.total)
            MetaLabel(
                stringResource(R.string.player_position_in_show, position.index, position.total),
                showsTick = false,
                modifier = Modifier.semantics {
                    contentDescription = positionDescription
                },
            )
        }

        Spacer(Modifier.height(22.dp))

        Slider(
            value = displayTime.toFloat().coerceIn(0f, duration.toFloat()),
            onValueChange = { onScrub(it.toDouble()) },
            // Seek once, when the finger lifts — otherwise the twice-a-
            // second updates fight the thumb.
            onValueChangeFinished = { onSeek(displayTime) },
            valueRange = 0f..duration.toFloat(),
            colors = SliderDefaults.colors(
                thumbColor = GcpColors.Sky,
                activeTrackColor = GcpColors.Sky,
                inactiveTrackColor = GcpColors.Sky.copy(alpha = 0.22f),
            ),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            val showHours = state.durationSeconds >= 3600
            Text(formatTime(displayTime, showHours), style = GcpType.semibold(11f), color = GcpColors.Muted)
            Text(
                "−" + formatTime((state.durationSeconds - displayTime).coerceAtLeast(0.0), showHours),
                style = GcpType.semibold(11f),
                color = GcpColors.Muted,
            )
        }

        Spacer(Modifier.height(22.dp))

        // The gradient lands here and nowhere else on the screen: it marks
        // the thing that plays.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(30.dp),
        ) {
            SkipButton(15, Icons.Filled.Replay) { onSkip(-15.0) }
            GradientPlayButton(state.isPlaying, onTogglePlayPause)
            SkipButton(30, Icons.Filled.Refresh) { onSkip(30.0) }
        }

        Spacer(Modifier.height(22.dp))

        // Marks the current episode played and starts the show's next.
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(1.dp, GcpColors.Line, RoundedCornerShape(8.dp))
                .then(if (hasNext) Modifier.clickable(onClick = onPlayNext) else Modifier)
                .padding(vertical = 11.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                stringResource(R.string.player_play_next_episode).uppercase(),
                style = GcpType.meta(size = 10f, tracking = 1.8f),
                color = if (hasNext) GcpColors.Sky else GcpColors.Muted.copy(alpha = 0.5f),
            )
        }

        // Leaving for YouTube stops this player: the two cannot both hold the
        // audio focus, and YouTube's terms put background playback out of
        // reach anyway. Better to hand over cleanly than to have two things
        // fighting over the sound.
        state.episode?.let { episode ->
            Spacer(Modifier.height(12.dp))
            // The player reports 0 for an episode restored at launch and not
            // yet started, so the saved position stands in until it does.
            WatchOnYouTubeButton(
                episode,
                positionSeconds = scrubSeconds
                    ?: state.positionSeconds.takeIf { it > 0 }
                    ?: episode.positionSeconds,
            )
        }

        // Down here on its own line: beside the "x of y" counter it read as a
        // count of episodes being downloaded.
        if (state.episode != null) {
            Spacer(Modifier.height(12.dp))
            DownloadIndicator(downloadStatus, showsLabel = true)
        }
    }
}
