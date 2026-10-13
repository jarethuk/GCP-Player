package com.bencreswell.gcpplayer.ui.wide

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
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
import com.bencreswell.gcpplayer.ui.components.PatreonLockChip
import com.bencreswell.gcpplayer.ui.components.ScreenHeader
import com.bencreswell.gcpplayer.ui.shows.ShowsViewModel
import com.bencreswell.gcpplayer.ui.shows.hasLockedNewEpisode
import com.bencreswell.gcpplayer.ui.shows.hasNewEpisode
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType

/**
 * The tablet's leading column: the iPad app's `ShowsSidebar`, and the reason
 * a tablet is worth laying out at all.
 *
 * My Shows and All Shows are both simply shown, as sections. The phone's
 * toggle exists because there is room for one list at a time, and it pays for
 * that by hiding half the catalogue.
 */
@Composable
fun ShowsSidebar(
    viewModel: ShowsViewModel,
    selectedSlug: String?,
    onSelect: (String) -> Unit,
    onOpenSettings: () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    val shows by viewModel.shows.collectAsStateWithLifecycle()
    val isSyncing by viewModel.isSyncing.collectAsStateWithLifecycle()
    val hasToken by viewModel.hasToken.collectAsStateWithLifecycle()
    val starred = shows.filter { it.isStarred }

    PullToRefreshBox(isRefreshing = isSyncing, onRefresh = viewModel::refresh, modifier = modifier) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = contentPadding) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 14.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    ScreenHeader(
                        stringResource(R.string.shows_eyebrow),
                        stringResource(R.string.shows_title),
                        Modifier.weight(1f),
                        titleSize = 26f,
                    )
                    CircleIconButton(
                        Icons.Filled.Settings,
                        stringResource(R.string.common_settings),
                        Modifier.clickable(onClick = onOpenSettings),
                    )
                }
            }

            if (starred.isNotEmpty()) {
                item { SectionLabel(stringResource(R.string.shows_my_shows)) }
                items(starred, key = { "starred-" + it.slug }) { show ->
                    SidebarRow(show, hasToken, show.slug == selectedSlug) { onSelect(show.slug) }
                }
                item { Spacer(Modifier.height(14.dp)) }
            }

            item { SectionLabel(stringResource(R.string.shows_all_shows)) }
            items(shows, key = { it.slug }) { show ->
                SidebarRow(show, hasToken, show.slug == selectedSlug) { onSelect(show.slug) }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    MetaLabel(text, showsTick = false, color = GcpColors.Sky, modifier = Modifier.padding(start = 16.dp, bottom = 6.dp))
}

/**
 * A show in the sidebar: rail, cover, title. The phone's card drawn small would
 * say "separate object", and in a sidebar the selection does that job — so the
 * card goes and the rail stays.
 */
@Composable
private fun SidebarRow(show: ShowWithCounts, hasToken: Boolean, isSelected: Boolean, onClick: () -> Unit) {
    val isNew = show.hasNewEpisode(hasToken)
    val isLockedNew = show.hasLockedNewEpisode(hasToken)
    val newDescription = stringResource(R.string.shows_a11y_new_episode)
    val lockedNewDescription = stringResource(R.string.shows_a11y_locked_new)

    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isSelected) GcpColors.Surface else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 5.dp)
            .clearAndSetSemantics {
                contentDescription = listOfNotNull(
                    show.title,
                    if (isNew) newDescription else null,
                    if (isLockedNew) lockedNewDescription else null,
                ).joinToString(", ")
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Always here, and clear when there's nothing new: a rail that comes
        // and goes would move every cover beside it.
        Box(
            Modifier
                .size(width = 3.dp, height = 34.dp)
                .clip(CircleShape)
                .background(if (isNew) GcpColors.Ember else Color.Transparent)
        )
        Artwork(show.artworkUrl, 40.dp, cornerRadius = 6.dp)
        Column(Modifier.weight(1f)) {
            Text(
                show.title.uppercase(),
                style = GcpType.display(11f),
                color = GcpColors.Bone,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            show.system?.let {
                Text(it, style = GcpType.body(10f), color = GcpColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        // The sidebar marks NEW with its rail alone; the padlock takes the
        // trailing edge, where the phone's row puts its chips.
        if (isLockedNew) PatreonLockChip()
    }
}
