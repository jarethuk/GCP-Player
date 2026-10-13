package com.bencreswell.gcpplayer.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.automirrored.filled.PlaylistAddCheck
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.playback.DownloadStatus
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/** The "⋮" menu for an episode — on list rows and the episode screen. */
@Composable
fun EpisodeActionsMenu(
    episode: EpisodeEntity,
    /** Patreon's alone, with no token: nothing to download. */
    isLocked: Boolean,
    status: DownloadStatus?,
    onDownload: () -> Unit,
    onRemoveDownload: () -> Unit,
    onSetPlayed: (Boolean) -> Unit,
    onMarkPreviousPlayed: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = GcpColors.Muted,
) {
    var expanded by remember { mutableStateOf(false) }

    IconButton(onClick = { expanded = true }, modifier = modifier.size(32.dp)) {
        Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.actions_a11y_menu), tint = tint)
    }

    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        when {
            status?.isComplete == true -> DropdownMenuItem(
                text = { Text(stringResource(R.string.actions_remove_download), style = GcpType.body(14f)) },
                leadingIcon = { Icon(Icons.Filled.Delete, null, tint = GcpColors.Ember) },
                onClick = { expanded = false; onRemoveDownload() },
            )

            // Nothing to do but wait — say so rather than offer a button
            // that would be ignored.
            status?.isInFlight == true -> DropdownMenuItem(
                text = { Text(stringResource(R.string.actions_downloading), style = GcpType.body(14f), color = GcpColors.Muted) },
                leadingIcon = { Icon(Icons.Filled.Download, null, tint = GcpColors.Muted) },
                enabled = false,
                onClick = {},
            )

            isLocked -> DropdownMenuItem(
                text = { Text(stringResource(R.string.actions_patreon_only), style = GcpType.body(14f), color = GcpColors.Muted) },
                leadingIcon = { Icon(Icons.Filled.Lock, null, tint = GcpColors.Muted) },
                enabled = false,
                onClick = {},
            )

            else -> DropdownMenuItem(
                text = { Text(stringResource(R.string.actions_download), style = GcpType.body(14f)) },
                leadingIcon = { Icon(Icons.Filled.Download, null, tint = GcpColors.Sky) },
                onClick = { expanded = false; onDownload() },
            )
        }

        WatchOnYouTubeMenuItem(episode) { expanded = false }

        HorizontalDivider(color = GcpColors.Line)

        DropdownMenuItem(
            text = {
                Text(
                    stringResource(if (episode.isPlayed) R.string.actions_mark_unplayed else R.string.actions_mark_played),
                    style = GcpType.body(14f),
                )
            },
            leadingIcon = {
                Icon(
                    if (episode.isPlayed) Icons.Filled.RadioButtonUnchecked else Icons.Filled.CheckCircle,
                    null,
                    tint = GcpColors.Sky,
                )
            },
            // Marking played also frees the downloaded file; unmarking
            // leaves it to be fetched again on the next play.
            onClick = { expanded = false; onSetPlayed(!episode.isPlayed) },
        )

        DropdownMenuItem(
            text = { Text(stringResource(R.string.actions_mark_previous_played), style = GcpType.body(14f)) },
            leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistAddCheck, null, tint = GcpColors.Sky) },
            onClick = { expanded = false; onMarkPreviousPlayed() },
        )
    }
}
