package com.bencreswell.gcpplayer.ui.episode

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.ShowEntity
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.repo.LibraryRepository
import com.bencreswell.gcpplayer.playback.DownloadStatus
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import com.bencreswell.gcpplayer.playback.EpisodeAudio
import com.bencreswell.gcpplayer.playback.PlayerController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@UnstableApi
@HiltViewModel
class EpisodeViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val library: LibraryRepository,
    private val downloads: DownloadsRepository,
    private val player: PlayerController,
    private val audio: EpisodeAudio,
    patreon: PatreonAccount,
) : ViewModel() {

    private val guid: String = checkNotNull(savedState["guid"])

    val episode: StateFlow<EpisodeEntity?> = library.observeEpisode(guid)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val show: StateFlow<ShowEntity?> = episode
        .flatMapLatest { it?.showSlug?.let(library::observeShow) ?: flowOf(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val downloadStatuses: StateFlow<Map<String, DownloadStatus>> = downloads.statuses

    val hasToken: StateFlow<Boolean> = patreon.hasToken
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun play() {
        val episode = episode.value ?: return
        player.play(episode)
    }

    fun togglePlayPause() = player.togglePlayPause()

    fun setPlayed(played: Boolean) {
        viewModelScope.launch { library.setPlayed(guid, played) }
    }

    fun markPreviousPlayed() {
        viewModelScope.launch { library.markPreviousPlayed(guid) }
    }

    fun download() {
        val episode = episode.value ?: return
        viewModelScope.launch { audio.download(episode, manual = true) }
    }

    fun removeDownload() = downloads.remove(guid)
}
