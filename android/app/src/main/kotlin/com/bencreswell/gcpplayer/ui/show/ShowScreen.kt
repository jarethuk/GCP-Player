package com.bencreswell.gcpplayer.ui.show

import android.content.res.Resources
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.durationText
import com.bencreswell.gcpplayer.data.model.isLocked
import com.bencreswell.gcpplayer.ui.components.DownloadIndicator
import com.bencreswell.gcpplayer.ui.components.EpisodeActionsMenu
import com.bencreswell.gcpplayer.ui.components.Hairline
import com.bencreswell.gcpplayer.ui.components.MetaLabel
import com.bencreswell.gcpplayer.ui.components.PatreonMark
import com.bencreswell.gcpplayer.ui.components.SegmentedPicker
import com.bencreswell.gcpplayer.ui.components.WideArtwork
import com.bencreswell.gcpplayer.ui.LocalIsWideLayout
import com.bencreswell.gcpplayer.ui.theme.AccentGradient
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A single show: full-bleed hero artwork extending behind the status bar,
 * played/unplayed tabs, and episodes in listening order.
 */
@Composable
fun ShowScreen(
    onBack: () -> Unit,
    onOpenEpisode: (String) -> Unit,
    contentPadding: PaddingValues,
    viewModel: ShowViewModel = hiltViewModel(),
) {
    val show by viewModel.show.collectAsStateWithLifecycle()
    val allEpisodes by viewModel.episodes.collectAsStateWithLifecycle()
    val filter by viewModel.filter.collectAsStateWithLifecycle()
    val statuses by viewModel.downloadStatuses.collectAsStateWithLifecycle()
    val hasToken by viewModel.hasToken.collectAsStateWithLifecycle()

    val episodes = allEpisodes.filter { (filter == PlayedFilter.Played) == it.isPlayed }
    val resources = LocalResources.current
    val template = remember(allEpisodes, resources) { chipTemplate(resources, allEpisodes) }
    val listState = rememberLazyListState()

    BoxWithConstraints(
        // Flat ink rather than the ground gradient: the hero's scrim fades
        // into the page, and a gradient behind it would show the seam.
        Modifier.fillMaxSize().background(GcpColors.Ink)
    ) {
        // Given a tablet's width, as on the iPad: full-bleed art that grows,
        // and a list that stops at a readable measure and centres. A title set
        // across 900 dp is unreadable, and the row's chip-title-menu rhythm
        // comes apart when its middle stretches.
        val isWide = LocalIsWideLayout.current || maxWidth >= 600.dp
        val heroHeight = if (isWide) 380.dp else 320.dp
        val rowModifier = Modifier.widthIn(max = 760.dp).fillMaxWidth()
        // Where there's width for it, the thing you opened the show to do:
        // on a tablet the list can be sixty rows long before it reaches it.
        val nextUnplayed = if (isWide) {
            allEpisodes.firstOrNull { !it.isPlayed && !it.isLocked(hasToken) }
        } else {
            null
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            // The hero ignores the top inset deliberately; only the bottom
            // one is honoured so the last row clears the mini player.
            contentPadding = PaddingValues(bottom = contentPadding.calculateBottomPadding()),
        ) {
            item {
                Hero(
                    artworkUrl = show?.artworkUrl,
                    title = show?.title.orEmpty(),
                    subtitle = show?.system,
                    height = heroHeight,
                    playNext = nextUnplayed?.let { { viewModel.play(it) } },
                )
            }

            item {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    val labels = PlayedFilter.entries.map { stringResource(it.label) }
                    SegmentedPicker(
                        options = labels,
                        selected = labels[filter.ordinal],
                        onSelect = { label ->
                            viewModel.selectFilter(PlayedFilter.entries[labels.indexOf(label)])
                        },
                        modifier = rowModifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    )
                }
            }

            if (episodes.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        Text(
                            if (filter == PlayedFilter.Unplayed) stringResource(R.string.show_all_caught_up).uppercase()
                            else stringResource(R.string.show_nothing_played).uppercase(),
                            style = GcpType.display(15f),
                            color = GcpColors.Bone,
                        )
                    }
                }
            }

            items(episodes, key = { it.guid }) { episode ->
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                EpisodeRow(
                    modifier = rowModifier,
                    episode = episode,
                    hasToken = hasToken,
                    template = template,
                    status = statuses[episode.guid],
                    onClick = { onOpenEpisode(episode.guid) },
                    onDownload = { viewModel.download(episode) },
                    onRemoveDownload = { viewModel.removeDownload(episode.guid) },
                    onSetPlayed = { viewModel.setPlayed(episode.guid, it) },
                    onMarkPreviousPlayed = { viewModel.markPreviousPlayed(episode.guid) },
                )
                Hairline(rowModifier.padding(horizontal = 16.dp))
                }
            }
        }

        // The hero carries the show name, so the bar is just the two
        // controls, floating over the artwork.
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = contentPadding.calculateTopPadding())
                .padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.common_back), tint = GcpColors.Bone)
            }
            IconButton(onClick = viewModel::toggleStarred) {
                val starred = show?.isStarred == true
                Icon(
                    if (starred) Icons.Filled.Star else Icons.Outlined.StarBorder,
                    contentDescription = stringResource(
                        if (starred) R.string.show_remove_from_my_shows else R.string.show_add_to_my_shows
                    ),
                    tint = if (starred) GcpColors.Sky else GcpColors.Bone,
                )
            }
        }
    }
}

/**
 * The artwork, pinned to the very top, with a scrim carrying the show name
 * in display caps — the way the site titles a show over its art.
 */
@Composable
private fun Hero(
    artworkUrl: String?,
    title: String,
    subtitle: String?,
    height: androidx.compose.ui.unit.Dp,
    playNext: (() -> Unit)? = null,
) {
    val widthPx = LocalWindowInfo.current.containerSize.width
    val heightPx = with(LocalDensity.current) { height.toPx().toInt() }

    Box(Modifier.fillMaxWidth().height(height)) {
        // The square source has to cover a full-width rectangle, so decode
        // to the wider of the two edges.
        WideArtwork(artworkUrl, maxOf(widthPx, heightPx), Modifier.fillMaxSize())
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0.0f to GcpColors.Ink.copy(alpha = 0.05f),
                    0.62f to GcpColors.Ink.copy(alpha = 0.72f),
                    0.97f to GcpColors.Ink,
                )
            )
        )
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                // Clear of the Play Next Unplayed button beside it.
                .padding(end = if (playNext != null) 210.dp else 0.dp)
        ) {
            Text(
                title.uppercase(),
                style = GcpType.display(26f),
                color = GcpColors.Bone,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            // The system where the feed gives one, and nothing where it
            // doesn't — the episode count went with the iPhone app's counts.
            subtitle?.let {
                Spacer(Modifier.height(6.dp))
                MetaLabel(it, maxLines = 2)
            }
        }
        playNext?.let { onClick ->
            // The gradient, which in this app marks the thing that plays.
            Row(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 16.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(AccentGradient)
                    .clickable(onClick = onClick)
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = GcpColors.InkDeep, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.show_play_next_unplayed).uppercase(), style = GcpType.meta(size = 11f, tracking = 1.6f), color = GcpColors.InkDeep)
            }
        }
    }
}

@Composable
private fun EpisodeRow(
    modifier: Modifier = Modifier,
    episode: EpisodeEntity,
    hasToken: Boolean,
    template: ChipTemplate,
    status: com.bencreswell.gcpplayer.playback.DownloadStatus?,
    onClick: () -> Unit,
    onDownload: () -> Unit,
    onRemoveDownload: () -> Unit,
    onSetPlayed: (Boolean) -> Unit,
    onMarkPreviousPlayed: () -> Unit,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        // Centred, so the chip and the overflow menu sit against the middle of
        // the title block rather than riding its first line — which on a
        // two-line title left both stranded at the top.
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        NumberChip(episode, template)

        Column(Modifier.weight(1f)) {
            Text(
                episode.title,
                style = GcpType.semibold(14f),
                color = if (episode.isPlayed || episode.isLocked(hasToken)) GcpColors.Muted else GcpColors.Bone,
            )
            Spacer(Modifier.height(3.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                PatreonMark(episode, hasToken)
                Text(dateline(LocalResources.current, episode, hasToken), style = GcpType.body(11f), color = GcpColors.Muted)
                DownloadIndicator(status)
            }
        }

        EpisodeActionsMenu(
            episode = episode,
            isLocked = episode.isLocked(hasToken),
            status = status,
            onDownload = onDownload,
            onRemoveDownload = onRemoveDownload,
            onSetPlayed = onSetPlayed,
            onMarkPreviousPlayed = onMarkPreviousPlayed,
        )
    }
}

/**
 * The widest numbering in a show, as a string of zeroes — "E000" for a show
 * that reaches three figures.
 *
 * Every chip in the list reserves this much, so they are all one size and none
 * of them wraps. Taken from the whole show rather than the filtered list, or
 * the chips would resize as you flip between played and unplayed.
 *
 * Zeroes rather than the real maximum because in a proportional face "0" is
 * the widest digit, so this is the conservative reservation. Derived from the
 * largest *value*, not the longest rendering, which is the same thing for
 * positive integers.
 */
private data class ChipTemplate(val season: String?, val number: String)

private fun chipTemplate(resources: Resources, episodes: List<EpisodeEntity>): ChipTemplate {
    val digit = Regex("[0-9]")
    fun widest(values: List<Int>, format: Int): String? =
        values.maxOrNull()?.let { resources.getString(format, it).replace(digit, "0") }

    return ChipTemplate(
        season = widest(episodes.mapNotNull { it.season }, R.string.episode_season),
        // "E0" even for a show with no numbers at all: an unnumbered episode
        // still reserves the space, so its title lines up with a numbered
        // one's in a show that mixes the two.
        number = widest(episodes.mapNotNull { it.number }, R.string.episode_number)
            ?: resources.getString(R.string.episode_number, 0),
    )
}

/**
 * The season and episode numbers, boxed — which frees the line below for
 * the date and runtime alone.
 *
 * Every chip is the size of a two-line one, whether or not the episode has a
 * season, so a show that numbers some of its episodes by season and not others
 * doesn't produce a column of chips in two different sizes. The height is
 * reserved by laying out an invisible two-line template and centring the real
 * lines over it, rather than by a hard-coded height that would drift the moment
 * the type scale changed.
 */
@Composable
private fun NumberChip(episode: EpisodeEntity, template: ChipTemplate) {
    val number = episode.number
    val shape = RoundedCornerShape(5.dp)
    // An unnumbered episode reserves the same space without drawing a box, so
    // its title still lines up — and it does so by laying out the very same
    // invisible template, rather than by a second copy of the width that would
    // have to be kept in step by hand.
    val drawn = number != null

    Box(
        Modifier
            .widthIn(min = 34.dp)
            .clip(shape)
            .background(if (drawn) GcpColors.Sky.copy(alpha = 0.07f) else Color.Transparent)
            .border(1.dp, if (drawn) GcpColors.Line else Color.Transparent, shape)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        ChipLines(template.season, template.number, Modifier.alpha(0f))
        if (number != null) {
            ChipLines(
                episode.season?.let { stringResource(R.string.episode_season, it) },
                stringResource(R.string.episode_number, number),
            )
        }
    }
}

@Composable
private fun ChipLines(season: String?, number: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        season?.let { Text(it, style = GcpType.display(10f), color = GcpColors.Sky) }
        Text(number, style = GcpType.display(10f), color = GcpColors.Sky)
    }
}

/**
 * "14 Sep 2026 · 67 min" (skipping whatever is missing). The date the episode
 * is listed by — Patreon's, for a patron — and the runtime of the copy that
 * will play.
 */
private fun dateline(resources: Resources, episode: EpisodeEntity, hasToken: Boolean): String {
    val date = SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(Date(episode.listedAt))
    val duration = episode.durationText(resources, hasToken)
    return if (duration.isEmpty()) date else "$date · $duration"
}
