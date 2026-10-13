package com.bencreswell.gcpplayer.ui.show

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.ShowEntity
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.repo.LibraryRepository
import com.bencreswell.gcpplayer.playback.DownloadStatus
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import com.bencreswell.gcpplayer.playback.EpisodeAudio
import com.bencreswell.gcpplayer.playback.PlayerController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class PlayedFilter(@StringRes val label: Int) {
    Unplayed(R.string.show_unplayed),
    Played(R.string.show_played),
}

@UnstableApi
@HiltViewModel
class ShowViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val library: LibraryRepository,
    private val downloads: DownloadsRepository,
    private val audio: EpisodeAudio,
    private val player: PlayerController,
    patreon: PatreonAccount,
) : ViewModel() {

    private val slug: String = checkNotNull(savedState["slug"])

    val show: StateFlow<ShowEntity?> = library.observeShow(slug)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Whether padlocked episodes can play, and which date and runtime each row shows. */
    val hasToken: StateFlow<Boolean> = patreon.hasToken
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    /**
     * Oldest first — the order you'd listen to a campaign in. By listing date:
     * with a Patreon token, each early release sits where Patreon put it.
     */
    val episodes: StateFlow<List<EpisodeEntity>> = library.observeEpisodes(slug)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val downloadStatuses: StateFlow<Map<String, DownloadStatus>> = downloads.statuses

    private val _filter = MutableStateFlow(PlayedFilter.Unplayed)
    val filter: StateFlow<PlayedFilter> = _filter.asStateFlow()

    fun selectFilter(filter: PlayedFilter) { _filter.value = filter }

    fun toggleStarred() {
        val current = show.value ?: return
        viewModelScope.launch { library.setStarred(current.slug, !current.isStarred) }
    }

    fun setPlayed(guid: String, played: Boolean) {
        viewModelScope.launch { library.setPlayed(guid, played) }
    }

    fun markPreviousPlayed(guid: String) {
        viewModelScope.launch { library.markPreviousPlayed(guid) }
    }

    fun download(episode: EpisodeEntity) {
        viewModelScope.launch { audio.download(episode, manual = true) }
    }

    fun removeDownload(guid: String) = downloads.remove(guid)

    /** The wide layout's Play Next Unplayed. */
    fun play(episode: EpisodeEntity) = player.play(episode)
}
