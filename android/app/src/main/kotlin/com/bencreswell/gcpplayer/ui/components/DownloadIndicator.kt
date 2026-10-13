package com.bencreswell.gcpplayer.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.playback.DownloadStatus
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/**
 * Whether an episode is held on device. Deliberately quiet: downloaded is
 * the normal state for anything you're about to hear, so it reads as a
 * small confirmation rather than a badge competing with NEW.
 */
@Composable
fun DownloadIndicator(
    status: DownloadStatus?,
    modifier: Modifier = Modifier,
    showsLabel: Boolean = false,
) {
    when {
        status != null && status.isInFlight -> {
            // A ring that fills, rather than a spinner: the file is big
            // enough that "how far" is the useful part.
            val fraction by animateFloatAsState(status.percent, label = "downloadProgress")
            val percent = (fraction * 100).toInt()
            val description = stringResource(R.string.download_a11y_progress, percent)
            Row(
                modifier.semantics {
                    contentDescription = description
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Canvas(Modifier.size(14.dp)) {
                    val stroke = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                    val inset = stroke.width / 2
                    val arcSize = Size(size.width - stroke.width, size.height - stroke.width)
                    drawArc(
                        color = GcpColors.Sky.copy(alpha = 0.25f),
                        startAngle = 0f,
                        sweepAngle = 360f,
                        useCenter = false,
                        topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                        size = arcSize,
                        style = stroke,
                    )
                    drawArc(
                        color = GcpColors.Sky,
                        startAngle = -90f,
                        sweepAngle = 360f * fraction.coerceAtLeast(0.02f),
                        useCenter = false,
                        topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                        size = arcSize,
                        style = stroke,
                    )
                }
                if (showsLabel) {
                    Text(
                        stringResource(R.string.download_progress, percent).uppercase(),
                        style = GcpType.meta(),
                        color = GcpColors.Muted,
                    )
                }
            }
        }

        status != null && status.isComplete -> {
            val description = stringResource(R.string.download_a11y_downloaded)
            Row(
                modifier.semantics { contentDescription = description },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = GcpColors.Sky,
                    modifier = Modifier.size(13.dp),
                )
                if (showsLabel) {
                    Text(stringResource(R.string.download_downloaded).uppercase(), style = GcpType.meta(), color = GcpColors.Sky)
                }
            }
        }

        showsLabel -> {
            val description = stringResource(R.string.download_streaming)
            Row(
                modifier.semantics { contentDescription = description },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    Icons.Filled.Wifi,
                    contentDescription = null,
                    tint = GcpColors.Muted,
                    modifier = Modifier.size(12.dp),
                )
                Text(description.uppercase(), style = GcpType.meta(), color = GcpColors.Muted)
            }
        }
    }
}
