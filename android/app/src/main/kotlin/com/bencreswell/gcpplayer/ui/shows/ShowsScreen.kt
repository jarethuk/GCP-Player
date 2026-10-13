package com.bencreswell.gcpplayer.ui.shows

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.ShowWithCounts
import com.bencreswell.gcpplayer.ui.components.Artwork
import com.bencreswell.gcpplayer.ui.components.CircleIconButton
import com.bencreswell.gcpplayer.ui.components.MetaLabel
import com.bencreswell.gcpplayer.ui.components.NewChip
import com.bencreswell.gcpplayer.ui.components.PatreonLockChip
import com.bencreswell.gcpplayer.ui.components.ScreenHeader
import com.bencreswell.gcpplayer.ui.components.SegmentedPicker
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType
import kotlin.time.Duration.Companion.days

/**
 * The root screen: every show, most recently published first — the shows
 * with something new waiting are the ones you're looking for.
 */
@Composable
fun ShowsScreen(
    onOpenShow: (String) -> Unit,
    onOpenSettings: () -> Unit,
    contentPadding: PaddingValues,
    viewModel: ShowsViewModel = hiltViewModel(),
) {
    val shows by viewModel.shows.collectAsStateWithLifecycle()
    val isSyncing by viewModel.isSyncing.collectAsStateWithLifecycle()
    val syncError by viewModel.syncError.collectAsStateWithLifecycle()
    val tab by viewModel.tab.collectAsStateWithLifecycle()
    val hasToken by viewModel.hasToken.collectAsStateWithLifecycle()

    val hasStarred = shows.any { it.isStarred }
    val visible = if (hasStarred && tab == ShowsTab.MyShows) shows.filter { it.isStarred } else shows

    PullToRefreshBox(
        isRefreshing = isSyncing,
        onRefresh = viewModel::refresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = contentPadding,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    ScreenHeader(
                        stringResource(R.string.shows_eyebrow),
                        stringResource(R.string.shows_title),
                        Modifier.weight(1f),
                    )
                    // Top-aligned with the eyebrow, not in a bar of its own:
                    // a toolbar here would push the whole screen down.
                    CircleIconButton(
                        Icons.Filled.Settings,
                        stringResource(R.string.common_settings),
                        Modifier.clickable(onClick = onOpenSettings),
                    )
                }
            }

            // The tabs only exist once something has been starred.
            if (hasStarred) {
                item {
                    val labels = ShowsTab.entries.map { stringResource(it.label) }
                    SegmentedPicker(
                        options = labels,
                        selected = labels[tab.ordinal],
                        onSelect = { label ->
                            viewModel.selectTab(ShowsTab.entries[labels.indexOf(label)])
                        },
                        modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 6.dp),
                    )
                }
            }

            items(visible, key = { it.slug }) { show ->
                ShowRow(show, hasToken, Modifier.padding(horizontal = 12.dp)) { onOpenShow(show.slug) }
            }

            // Empty-state handling: only relevant before the first
            // successful sync, since the data persists after that.
            if (shows.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 80.dp), contentAlignment = Alignment.Center) {
                        when {
                            isSyncing -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                CircularProgressIndicator(color = GcpColors.Sky)
                                Spacer(Modifier.height(14.dp))
                                MetaLabel(stringResource(R.string.shows_loading), showsTick = false)
                            }

                            syncError != null -> Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(horizontal = 32.dp),
                            ) {
                                Text(
                                    stringResource(R.string.shows_load_failed).uppercase(),
                                    style = GcpType.display(16f),
                                    color = GcpColors.Bone,
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    syncError.orEmpty(),
                                    style = GcpType.body(12f),
                                    color = GcpColors.Muted,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Five days. Nearly every show on the network is weekly — 21 of the 23 with
 * enough history publish at least that often, and the median gap is exactly
 * seven days — so the chip marks the current episode and then goes out for a
 * day or two before the next one lands. A badge that is always lit says
 * nothing.
 */
private val RecentWindowMillis = 5.days.inWholeMilliseconds

/**
 * "New" has to mean *newly published*, not merely unheard — on a back
 * catalogue this size almost every show has something unplayed, and a badge
 * on every row is a badge on none.
 *
 * Only what this device can play counts: without a Patreon token, a public
 * show's early release doesn't make it NEW. [ShowWithCounts.unplayedCount] is
 * already counted that way.
 */
fun ShowWithCounts.hasNewEpisode(hasToken: Boolean, now: Long = System.currentTimeMillis()): Boolean {
    val latest = if (hasToken) latestEpisodeAt else latestPublicEpisodeAt
    return unplayedCount > 0 && latest > now - RecentWindowMillis
}

/**
 * A padlock where the NEW chip would be: there is no Patreon token, and what
 * the show has is Patreon's — a Patreon-only show, always, or a public one
 * whose newest episode is an early release. The list sorts on that episode
 * either way, and without this the row would say nothing about why it is near
 * the top.
 */
fun ShowWithCounts.hasLockedNewEpisode(hasToken: Boolean, now: Long = System.currentTimeMillis()): Boolean {
    if (hasToken || hasNewEpisode(hasToken = false, now)) return false
    if (!isPublic) return true
    return latestEpisodeAt > latestPublicEpisodeAt && latestEpisodeAt > now - RecentWindowMillis
}

/**
 * One show: cover, name in display caps, and its game system the way the
 * site sets metadata. A show with something newly published carries a red
 * rail down its edge. No counts: the iPhone app dropped them as numbers nobody
 * was reading, on a back catalogue where almost everything has something
 * unplayed.
 */
@Composable
private fun ShowRow(show: ShowWithCounts, hasToken: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val isNew = show.hasNewEpisode(hasToken)
    val isLockedNew = show.hasLockedNewEpisode(hasToken)
    // The site labels a show by its system, and a show without one goes
    // without a label.
    val subtitle = show.system
    val newDescription = pluralStringResource(
        R.plurals.shows_a11y_new_episode_unplayed,
        show.unplayedCount,
        show.unplayedCount,
    )
    val lockedNewDescription = stringResource(R.string.shows_a11y_locked_new)

    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(GcpColors.Surface)
            .border(1.dp, GcpColors.Line, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = listOfNotNull(
                    show.title,
                    subtitle,
                    if (isNew) newDescription else null,
                    if (isLockedNew) lockedNewDescription else null,
                ).joinToString(", ")
            }
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = if (isNew) 8.dp else 11.dp, end = 11.dp, top = 9.dp, bottom = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Artwork(show.artworkUrl, 56.dp)

            Column(Modifier.weight(1f)) {
                Text(
                    show.title.uppercase(),
                    style = GcpType.display(14f),
                    color = GcpColors.Bone,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                subtitle?.let {
                    Spacer(Modifier.height(4.dp))
                    MetaLabel(it, maxLines = 2)
                }
            }

            when {
                isNew -> NewChip()
                isLockedNew -> PatreonLockChip()
            }
        }

        // The rail reads as part of the card's edge, so it's clipped to the
        // same shape rather than drawn as a separate bar — and it takes the
        // card's height via matchParentSize rather than trying to set it.
        if (isNew) {
            Box(Modifier.matchParentSize()) {
                Box(Modifier.width(3.dp).fillMaxHeight().background(GcpColors.Ember))
            }
        }
    }
}
