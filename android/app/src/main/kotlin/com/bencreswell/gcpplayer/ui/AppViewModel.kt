package com.bencreswell.gcpplayer.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.data.repo.LibraryRepository
import com.bencreswell.gcpplayer.playback.DownloadStatus
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import com.bencreswell.gcpplayer.playback.PlaybackState
import com.bencreswell.gcpplayer.playback.PlayerController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The player, for whichever screen is on top. Scoped to the activity rather
 * than to a screen, because the mini player outlives all of them.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@UnstableApi
@HiltViewModel
class AppViewModel @Inject constructor(
    private val player: PlayerController,
    private val library: LibraryRepository,
    downloads: DownloadsRepository,
) : ViewModel() {

    val playback: StateFlow<PlaybackState> = player.state
    val scrubSeconds: StateFlow<Double?> = player.scrubSeconds

    val downloadStatuses: StateFlow<Map<String, DownloadStatus>> = downloads.statuses

    /** Whether "play next episode" has anywhere to go. */
    private val _hasNext = MutableStateFlow(false)
    val hasNext: StateFlow<Boolean> = _hasNext.asStateFlow()

    init {
        player.connect()
        viewModelScope.launch {
            player.state.map { it.episode?.guid }.collect { guid ->
                _hasNext.value = guid != null && library.nextInShow(guid) != null
            }
        }
    }

    fun togglePlayPause() = player.togglePlayPause()
    fun skip(seconds: Double) = player.skip(seconds)
    fun scrub(seconds: Double) = player.scrubTo(seconds)
    fun seek(seconds: Double) = player.seekTo(seconds)
    fun playNext() = player.playNext()
}
