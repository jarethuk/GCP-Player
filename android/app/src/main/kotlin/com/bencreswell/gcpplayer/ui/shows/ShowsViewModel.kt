package com.bencreswell.gcpplayer.ui.shows

import android.content.Context
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.sync.SyncEngine
import com.bencreswell.gcpplayer.data.model.ShowWithCounts
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.repo.LibraryRepository
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

enum class ShowsTab(@StringRes val label: Int) {
    MyShows(R.string.shows_my_shows),
    AllShows(R.string.shows_all_shows),
}

@UnstableApi
@HiltViewModel
class ShowsViewModel @Inject constructor(
    library: LibraryRepository,
    private val sync: SyncEngine,
    private val downloads: DownloadsRepository,
    private val episodeDao: EpisodeDao,
    patreon: PatreonAccount,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val shows: StateFlow<List<ShowWithCounts>> = library.observeShows()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Whether Patreon's episodes count as new — see [hasNewEpisode]. */
    val hasToken: StateFlow<Boolean> = patreon.hasToken
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _syncError = MutableStateFlow<String?>(null)
    val syncError: StateFlow<String?> = _syncError.asStateFlow()

    private val _tab = MutableStateFlow(ShowsTab.MyShows)
    val tab: StateFlow<ShowsTab> = _tab.asStateFlow()

    init {
        // Syncing is idempotent, so doing it every launch is safe.
        refresh()
        purgeDownloads()
    }

    fun selectTab(tab: ShowsTab) { _tab.value = tab }

    fun refresh() {
        if (_isSyncing.value) return
        viewModelScope.launch {
            _isSyncing.value = true
            runCatching { sync.sync() }
                .onSuccess { result ->
                    _syncError.value = null
                    // One show's episodes failing is not a failed sync: the
                    // rest applied, and that show's cursor was left alone so
                    // the next launch asks for the same window again.
                    if (result.failedShows.isNotEmpty()) {
                        android.util.Log.i("Shows", "shows unavailable: ${result.failedShows.joinToString()}")
                    }
                }
                .onFailure { _syncError.value = it.message ?: context.getString(R.string.errors_catalogue_unreachable) }
            _isSyncing.value = false
        }
    }

    /**
     * Drops downloads that have been heard or have sat for a week. Artwork
     * is deliberately not swept: covers are tiny and change about never.
     */
    private fun purgeDownloads() {
        viewModelScope.launch {
            val played = withContext(Dispatchers.IO) {
                episodeDao.all().filter { it.isPlayed }.map { it.guid }.toSet()
            }
            withContext(Dispatchers.IO) { downloads.purgeExpired(played) }
        }
    }
}
