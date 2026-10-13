package com.bencreswell.gcpplayer.ui.episode

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.ShowEntity
import com.bencreswell.gcpplayer.data.model.durationText
import com.bencreswell.gcpplayer.data.model.isLocked
import com.bencreswell.gcpplayer.data.model.plainDescription
import com.bencreswell.gcpplayer.playback.PlaybackState
import com.bencreswell.gcpplayer.ui.LocalIsWideLayout
import com.bencreswell.gcpplayer.ui.components.Artwork
import com.bencreswell.gcpplayer.ui.components.DownloadIndicator
import com.bencreswell.gcpplayer.ui.components.EpisodeActionsMenu
import com.bencreswell.gcpplayer.ui.components.MetaLabel
import com.bencreswell.gcpplayer.ui.components.PatreonMark
import com.bencreswell.gcpplayer.ui.components.WatchOnYouTubeButton
import com.bencreswell.gcpplayer.ui.theme.AccentGradient
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/** Details for a single episode. */
@Composable
fun EpisodeScreen(
    playback: PlaybackState,
    onBack: () -> Unit,
    contentPadding: PaddingValues,
    viewModel: EpisodeViewModel = hiltViewModel(),
) {
    val episode by viewModel.episode.collectAsStateWithLifecycle()
    val show by viewModel.show.collectAsStateWithLifecycle()
    val statuses by viewModel.downloadStatuses.collectAsStateWithLifecycle()
    val hasToken by viewModel.hasToken.collectAsStateWithLifecycle()
    val current = episode ?: return
    val isWideLayout = LocalIsWideLayout.current

    // Is *this* episode the one loaded in the player?
    val isCurrent = playback.episode?.guid == current.guid
    val isPlayingThis = isCurrent && playback.isPlaying
    val isPreparingThis = isCurrent && playback.isPreparing

    Column(
        Modifier
            .fillMaxSize()
            .background(GcpColors.Ink)
            .padding(contentPadding)
            .verticalScroll(rememberScrollState()),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.common_back), tint = GcpColors.Bone)
            }
            EpisodeActionsMenu(
                episode = current,
                isLocked = current.isLocked(hasToken),
                status = statuses[current.guid],
                onDownload = viewModel::download,
                onRemoveDownload = viewModel::removeDownload,
                onSetPlayed = viewModel::setPlayed,
                onMarkPreviousPlayed = viewModel::markPreviousPlayed,
                tint = GcpColors.Bone,
            )
        }

        // Two columns where there is room, as on the iPad: the cover and the
        // controls in a rail, the description beside it. A single column
        // stretched to seven hundred dp is the most obviously-a-phone screen
        // there is.
        BoxWithConstraints(Modifier.fillMaxWidth().padding(16.dp)) {
            val artworkUrl = current.artworkUrl ?: show?.artworkUrl
            val titleBlock: @Composable () -> Unit = {
                Column {
                    Text(current.title.uppercase(), style = GcpType.display(22f), color = GcpColors.Bone)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        val showTitle = show?.title ?: stringResource(R.string.episode_unknown_show)
                        MetaLabel(
                            "$showTitle · ${current.durationText(LocalResources.current, hasToken)}",
                            maxLines = 2,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        PatreonMark(current, hasToken)
                        DownloadIndicator(statuses[current.guid])
                    }
                }
            }
            // The tablet layout in a pane too narrow for two columns (a
            // portrait tablet beside the sidebar): the rail centred, the
            // title and description under it.
            val isStacked = isWideLayout && maxWidth < 640.dp
            val controls: @Composable () -> Unit = {
                Column {
                    if (current.isLocked(hasToken)) {
                        LockedNotice(show, centred = isStacked)
                    } else {
                        PlayButton(
                            isPlaying = isPlayingThis,
                            isPreparing = isPreparingThis,
                            onClick = { if (isCurrent) viewModel.togglePlayPause() else viewModel.play() },
                        )
                    }
                    if (isCurrent && playback.error != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(playback.error, style = GcpType.body(12f), color = GcpColors.Ember)
                    }
                    // Draws nothing when the network never filmed this one.
                    Spacer(Modifier.height(12.dp))
                    WatchOnYouTubeButton(
                        current,
                        // The player's live position when it holds this one —
                        // except an episode restored at launch and not yet
                        // started, which it reports as 0.
                        positionSeconds = playback.positionSeconds
                            .takeIf { isCurrent && it > 0 }
                            ?: current.positionSeconds,
                    )
                }
            }
            val description: @Composable () -> Unit = {
                current.plainDescription()?.let {
                    Text(it, style = GcpType.body(14f), color = GcpColors.Muted)
                }
            }

            if (maxWidth >= 640.dp) {
                Row(
                    Modifier.widthIn(max = 900.dp).align(Alignment.TopCenter),
                    horizontalArrangement = Arrangement.spacedBy(30.dp),
                ) {
                    Column(Modifier.width(280.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Artwork(artworkUrl, 280.dp)
                        controls()
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        titleBlock()
                        description()
                    }
                }
            } else if (isStacked) {
                Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    Column(
                        Modifier.width(280.dp).align(Alignment.CenterHorizontally),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Artwork(artworkUrl, 280.dp)
                        controls()
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        titleBlock()
                        description()
                    }
                }
            } else {
                Column {
                    Artwork(artworkUrl, 200.dp, Modifier.align(Alignment.CenterHorizontally))
                    Spacer(Modifier.height(16.dp))
                    titleBlock()
                    Spacer(Modifier.height(16.dp))
                    controls()
                    Spacer(Modifier.height(16.dp))
                    description()
                }
            }
        }
    }
}

/** The gradient button, which in this app marks the thing that plays. */
@Composable
private fun PlayButton(isPlaying: Boolean, isPreparing: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(AccentGradient)
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (isPreparing) {
                // Asking Patreon for the audio, or buffering it.
                CircularProgressIndicator(color = GcpColors.InkDeep, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            } else {
                Icon(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = GcpColors.InkDeep,
                    modifier = Modifier.size(18.dp),
                )
            }
            Text(
                when {
                    isPreparing -> stringResource(R.string.episode_loading)
                    isPlaying -> stringResource(R.string.episode_pause)
                    else -> stringResource(R.string.episode_play)
                }.uppercase(),
                style = GcpType.meta(size = 11f, tracking = 1.8f),
                color = GcpColors.InkDeep,
            )
        }
    }
}

/**
 * In place of Play, for an episode only Patreon has and this device can't
 * reach: what it is, and where to go to fix that.
 */
@Composable
private fun LockedNotice(show: ShowEntity?, centred: Boolean = false) {
    Column {
        Box(
            Modifier
                .fillMaxWidth()
                .border(1.dp, GcpColors.Line, RoundedCornerShape(8.dp))
                .padding(vertical = 13.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Lock, contentDescription = null, tint = GcpColors.Muted, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.episode_locked_title).uppercase(), style = GcpType.meta(size = 11f, tracking = 1.8f), color = GcpColors.Muted)
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            if (show?.isPublic == false) {
                stringResource(R.string.episode_locked_patreon_only_show)
            } else {
                stringResource(R.string.episode_locked_early_release)
            },
            style = GcpType.body(12f),
            color = GcpColors.Muted,
            textAlign = if (centred) TextAlign.Center else TextAlign.Start,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
