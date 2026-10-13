package com.bencreswell.gcpplayer.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.patreon.PatreonFeeds
import com.bencreswell.gcpplayer.data.settings.AppSettings
import com.bencreswell.gcpplayer.data.settings.SettingsStore
import com.bencreswell.gcpplayer.data.sync.SyncEngine
import com.bencreswell.gcpplayer.playback.PlayerController
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@UnstableApi
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val store: SettingsStore,
    private val sync: SyncEngine,
    private val player: PlayerController,
    private val patreon: PatreonAccount,
    private val feeds: PatreonFeeds,
    private val showDao: ShowDao,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val hasPatreonToken: StateFlow<Boolean> = patreon.hasToken
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    /** True while a pasted link is being tried against Patreon. */
    private val _isCheckingPatreon = MutableStateFlow(false)
    val isCheckingPatreon: StateFlow<Boolean> = _isCheckingPatreon.asStateFlow()

    /** Why the last pasted link wasn't kept. */
    private val _patreonError = MutableStateFlow<String?>(null)
    val patreonError: StateFlow<String?> = _patreonError.asStateFlow()

    /**
     * Takes the token out of a pasted Patreon feed link, makes sure Patreon
     * accepts it, and keeps it. Only the token is stored — the rest of the link
     * is always the same. Resolves true when it was kept.
     */
    fun savePatreonLink(link: String, onSaved: () -> Unit) {
        if (_isCheckingPatreon.value) return
        _patreonError.value = null
        val token = PatreonAccount.tokenFromFeedLink(link)
        if (token == null) {
            _patreonError.value = context.getString(R.string.patreon_invalid_link)
            return
        }
        viewModelScope.launch {
            _isCheckingPatreon.value = true
            // Checked against one of the shows Patreon carries, where the
            // catalogue has one yet; a first launch with nothing synced keeps
            // it unchecked rather than refusing it.
            val result = runCatching {
                showDao.anyPatreonShowId()?.let { feeds.check(token, it) }
                patreon.setToken(token)
            }
            _isCheckingPatreon.value = false
            result
                .onSuccess { onSaved() }
                .onFailure { _patreonError.value = it.message ?: context.getString(R.string.patreon_error_unreachable) }
        }
    }

    /** Patreon episodes lock again. Anything already downloaded stays. */
    fun removePatreonLink() {
        viewModelScope.launch { patreon.setToken(null) }
    }

    val settings: StateFlow<AppSettings> = store.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    /** True while the local database is being wiped and refetched. */
    private val _isResetting = MutableStateFlow(false)
    val isResetting: StateFlow<Boolean> = _isResetting.asStateFlow()

    /** Set when a reset failed, and shown as an alert. null once dismissed. */
    private val _resetError = MutableStateFlow<String?>(null)
    val resetError: StateFlow<String?> = _resetError.asStateFlow()

    fun setWifiOnly(value: Boolean) = viewModelScope.launch { store.setWifiOnly(value) }.let {}
    fun setDownloadsCurrentEpisode(value: Boolean) =
        viewModelScope.launch { store.setDownloadsCurrentEpisode(value) }.let {}
    fun setDownloadsNextEpisode(value: Boolean) =
        viewModelScope.launch { store.setDownloadsNextEpisode(value) }.let {}

    /**
     * Throws away the local copy of the catalogue and fetches it again.
     *
     * Playback is stopped first, and not as a courtesy: the player is holding a
     * media id that is about to stop existing.
     */
    fun clearAndResync() {
        if (_isResetting.value) return
        viewModelScope.launch {
            _isResetting.value = true
            player.stop()
            runCatching { sync.clearAndResync() }
                .onFailure { _resetError.value = it.message ?: context.getString(R.string.errors_catalogue_unreachable) }
            _isResetting.value = false
        }
    }

    fun dismissResetError() { _resetError.value = null }
}
