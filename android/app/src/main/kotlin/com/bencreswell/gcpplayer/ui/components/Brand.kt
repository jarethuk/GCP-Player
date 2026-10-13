package com.bencreswell.gcpplayer.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.isLocked
import com.bencreswell.gcpplayer.data.model.isPatreonExclusive
import com.bencreswell.gcpplayer.ui.theme.AccentGradient
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/**
 * The site's metadata treatment: bold uppercase, widely tracked, behind a
 * short blue tick. Used for a show's game system, an episode's numbers,
 * anything the site would set as a label.
 */
@Composable
fun MetaLabel(
    text: String,
    modifier: Modifier = Modifier,
    showsTick: Boolean = true,
    color: Color = GcpColors.Muted,
    /** Systems run long, so callers with room can let them wrap. */
    maxLines: Int = 1,
) {
    Row(modifier, verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (showsTick) {
            Box(
                Modifier
                    // Sits on the first line's cap height, not the block's.
                    .padding(top = 3.dp)
                    .size(width = 2.dp, height = 10.dp)
                    .clip(CircleShape)
                    .background(GcpColors.Sky)
            )
        }
        Text(
            text = text.uppercase(),
            style = GcpType.meta(),
            color = color,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * The network opens every section with a spaced eyebrow over a heavy
 * display heading and a short gradient rule.
 */
@Composable
fun ScreenHeader(
    eyebrow: String,
    title: String,
    modifier: Modifier = Modifier,
    titleSize: Float = 34f,
) {
    Column(modifier) {
        MetaLabel(eyebrow, showsTick = false, color = GcpColors.Sky)
        Text(
            text = title.uppercase(),
            style = GcpType.display(titleSize),
            color = GcpColors.Bone,
            modifier = Modifier.padding(top = 6.dp),
        )
        Box(
            Modifier
                .padding(top = 8.dp)
                .size(width = 56.dp, height = 3.dp)
                .clip(CircleShape)
                .background(AccentGradient)
        )
    }
}

/**
 * The network's pill button, and the app's only use of the gradient: it
 * marks the thing that plays. One per screen.
 */
@Composable
fun GradientPlayButton(
    isPlaying: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Int = 62,
) {
    Box(
        modifier
            .shadow(12.dp, CircleShape, ambientColor = Color(0xFF00548E), spotColor = Color(0xFF00548E))
            .size(size.dp)
            .clip(CircleShape)
            .background(AccentGradient)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = stringResource(if (isPlaying) R.string.episode_pause else R.string.episode_play),
            tint = GcpColors.InkDeep,
            modifier = Modifier.size((size * 0.46).dp),
        )
    }
}

/**
 * A round, outlined transport control — the 15/30 second skips.
 *
 * Material ships Replay5/10/30 and Forward5/10/30 but no fifteen, and the
 * app skips back fifteen like its iOS counterpart. So the arrow and the
 * number are drawn separately, which is what iOS's own `gobackward.15`
 * glyph is anyway.
 */
@Composable
fun SkipButton(
    seconds: Int,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .size(44.dp)
            .clip(CircleShape)
            .border(1.5.dp, GcpColors.Bone.copy(alpha = 0.35f), CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = stringResource(R.string.player_a11y_skip, seconds),
            tint = GcpColors.Bone,
            modifier = Modifier.size(26.dp),
        )
        Text(
            "$seconds",
            style = GcpType.bold(8f),
            color = GcpColors.Bone,
            // The glyph's own centre sits a touch below the box's.
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

/**
 * The network's pill toggle: a gradient slug behind the selected option,
 * spaced uppercase labels either side.
 */
@Composable
fun SegmentedPicker(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .clip(RoundedCornerShape(8.dp))
            .background(GcpColors.InkDeep.copy(alpha = 0.7f))
            .border(1.dp, GcpColors.Line, RoundedCornerShape(8.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (option in options) {
            val isSelected = option == selected
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .then(if (isSelected) Modifier.background(AccentGradient) else Modifier)
                    .clickable { onSelect(option) }
                    .padding(vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = option.uppercase(),
                    style = GcpType.meta(size = 10f, tracking = 1.6f),
                    color = if (isSelected) GcpColors.InkDeep else GcpColors.Muted,
                )
            }
        }
    }
}

/**
 * The round header control: a disc in the surface colour, hairline border, sky
 * glyph. The Shows screen's gear, Settings' back arrow and its overflow menu
 * are all this, so the three read as one treatment.
 *
 * Takes a modifier and no click handler, so the same shape works for something
 * clickable, something inside a `DropdownMenu` anchor, or something disabled —
 * which is what the back arrow is while a resync is running.
 */
@Composable
fun CircleIconButton(
    icon: ImageVector,
    contentDescription: String,
    modifier: Modifier = Modifier,
    tint: Color = GcpColors.Sky,
) {
    Box(
        modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(GcpColors.Surface)
            .border(1.dp, GcpColors.Line, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription, tint = tint, modifier = Modifier.size(18.dp))
    }
}

/** The ember chip on a show that has published something unheard. */
@Composable
fun NewChip(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.shows_new_chip).uppercase(),
        style = GcpType.meta(size = 9f, tracking = 1.2f),
        color = Color.White,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(GcpColors.Ember)
            .padding(horizontal = 7.dp, vertical = 3.dp),
    )
}

/**
 * Where the NEW chip goes, on a show whose new episodes are Patreon's and this
 * device has no token to play them with. The same box as NEW, drawn quiet — an
 * outline, not the red that means "go and listen".
 */
@Composable
fun PatreonLockChip(modifier: Modifier = Modifier) {
    val description = stringResource(R.string.episode_a11y_locked)
    Box(
        modifier
            .border(1.dp, GcpColors.Muted.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
            .padding(horizontal = 7.dp, vertical = 3.dp)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Lock, contentDescription = null, tint = GcpColors.Muted, modifier = Modifier.size(11.dp))
    }
}

/**
 * Beside an episode's date: a padlock when it can't be played here, and
 * Patreon's name when it only exists there but can — so an early release reads
 * as one. Nothing for an episode anyone can play, even one that plays
 * Patreon's ad-free copy.
 */
@Composable
fun PatreonMark(episode: EpisodeEntity, hasToken: Boolean) {
    when {
        episode.isLocked(hasToken) -> Icon(
            Icons.Filled.Lock,
            contentDescription = stringResource(R.string.episode_a11y_locked),
            tint = GcpColors.Muted,
            modifier = Modifier.size(11.dp),
        )

        episode.isPatreonExclusive -> Text(
            stringResource(R.string.episode_patreon_mark).uppercase(),
            style = GcpType.meta(size = 9f, tracking = 1.2f),
            color = GcpColors.Sky,
        )
    }
}

/** A hairline rule, the accent at low opacity rather than grey. */
@Composable
fun Hairline(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(GcpColors.Line))
}
