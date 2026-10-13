package com.bencreswell.gcpplayer.ui.wide

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.ShowWithCounts
import com.bencreswell.gcpplayer.ui.components.MetaLabel
import com.bencreswell.gcpplayer.ui.components.NewChip
import com.bencreswell.gcpplayer.ui.components.PatreonLockChip
import com.bencreswell.gcpplayer.ui.components.ScreenHeader
import com.bencreswell.gcpplayer.ui.components.WideArtwork
import com.bencreswell.gcpplayer.ui.shows.ShowsViewModel
import com.bencreswell.gcpplayer.ui.shows.hasLockedNewEpisode
import com.bencreswell.gcpplayer.ui.shows.hasNewEpisode
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType
import com.bencreswell.gcpplayer.ui.theme.GroundGradient

/**
 * The poster wall a tablet shows before a show is picked, where a split view
 * would otherwise say "select a show" — the iPad app's `ShowsGridView`. Every
 * cover at 190 dp and up, the only place the network's artwork is shown at
 * anything like the size it was drawn at.
 */
@Composable
fun ShowsGrid(
    viewModel: ShowsViewModel,
    onOpenShow: (String) -> Unit,
    contentPadding: PaddingValues,
) {
    val shows by viewModel.shows.collectAsStateWithLifecycle()
    val hasToken by viewModel.hasToken.collectAsStateWithLifecycle()

    LazyVerticalGrid(
        columns = GridCells.Adaptive(190.dp),
        modifier = Modifier.fillMaxSize().background(GroundGradient),
        contentPadding = PaddingValues(
            start = 20.dp,
            end = 20.dp,
            top = contentPadding.calculateTopPadding() + 12.dp,
            bottom = contentPadding.calculateBottomPadding() + 20.dp,
        ),
        horizontalArrangement = Arrangement.spacedBy(18.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            ScreenHeader(
                stringResource(R.string.shows_eyebrow),
                stringResource(R.string.shows_grid_title),
                Modifier.padding(bottom = 4.dp),
                titleSize = 26f,
            )
        }
        items(shows, key = { it.slug }) { show ->
            ShowTile(show, hasToken) { onOpenShow(show.slug) }
        }
    }
}

/** One cover, with the show's name over a scrim — the same treatment as the show's hero. */
@Composable
private fun ShowTile(show: ShowWithCounts, hasToken: Boolean, onClick: () -> Unit) {
    val isNew = show.hasNewEpisode(hasToken)
    val isLockedNew = show.hasLockedNewEpisode(hasToken)
    val shape = RoundedCornerShape(12.dp)
    val newDescription = stringResource(R.string.shows_a11y_new_episode)
    val lockedNewDescription = stringResource(R.string.shows_a11y_locked_new)

    Column(
        Modifier
            .clickable(onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = listOfNotNull(
                    show.title,
                    show.system,
                    if (isNew) newDescription else null,
                    if (isLockedNew) lockedNewDescription else null,
                ).joinToString(", ")
            }
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(shape)
                .border(1.dp, if (isNew) GcpColors.Ember.copy(alpha = 0.65f) else GcpColors.Line, shape)
        ) {
            WideArtwork(show.artworkUrl, TILE_PIXELS, Modifier.fillMaxSize())
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .align(Alignment.BottomCenter)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, GcpColors.InkDeep.copy(alpha = 0.92f))))
            )
            Text(
                show.title.uppercase(),
                style = GcpType.display(13f),
                color = GcpColors.Bone,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
            )
            when {
                isNew -> NewChip(Modifier.align(Alignment.TopEnd).padding(8.dp))
                isLockedNew -> PatreonLockChip(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        // Over artwork, so it needs a ground of its own.
                        .background(GcpColors.InkDeep.copy(alpha = 0.8f), RoundedCornerShape(4.dp))
                )
            }
        }
        show.system?.let {
            MetaLabel(it, Modifier.padding(top = 8.dp, start = 2.dp, end = 2.dp))
        }
    }
}

private const val TILE_PIXELS = 520
