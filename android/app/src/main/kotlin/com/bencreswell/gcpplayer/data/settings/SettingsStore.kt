package com.bencreswell.gcpplayer.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** The user's download preferences, plus what was playing when they left. */
data class AppSettings(
    /** An episode is a 50–90 MB file; off by default this is not. */
    val wifiOnly: Boolean = true,
    val downloadsCurrentEpisode: Boolean = true,
    val downloadsNextEpisode: Boolean = true,
)

/**
 * Kept in DataStore rather than the database: these are about this device,
 * not about the feed, and the player and downloader both read them outside
 * any screen. The iOS app keeps the same three in `UserDefaults`.
 *
 * All three default on — and the defaults live in [AppSettings] rather than
 * in each read, so an unwritten key can't silently mean "off".
 */
@Singleton
class SettingsStore @Inject constructor(private val context: Context) {

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        AppSettings(
            wifiOnly = prefs[WIFI_ONLY] ?: true,
            downloadsCurrentEpisode = prefs[CURRENT_EPISODE] ?: true,
            downloadsNextEpisode = prefs[NEXT_EPISODE] ?: true,
        )
    }

    suspend fun current(): AppSettings = settings.first()

    suspend fun setWifiOnly(value: Boolean) = put(WIFI_ONLY, value)
    suspend fun setDownloadsCurrentEpisode(value: Boolean) = put(CURRENT_EPISODE, value)
    suspend fun setDownloadsNextEpisode(value: Boolean) = put(NEXT_EPISODE, value)

    /**
     * The guid of the last episode played, so the mini player can come back
     * where the user left it on the next launch.
     */
    val lastPlayedGuid: Flow<String?> = context.dataStore.data.map { it[LAST_PLAYED] }

    suspend fun setLastPlayedGuid(guid: String) {
        context.dataStore.edit { it[LAST_PLAYED] = guid }
    }

    /**
     * The `syncedAt` from the last shows delta, as epoch millis, passed back as
     * `since` on the next sync. One value for the whole list, unlike the
     * per-show episode cursors on the shows table, because the list is one
     * request.
     */
    suspend fun showsSyncedAt(): Long? = context.dataStore.data.first()[SHOWS_SYNCED_AT]

    suspend fun setShowsSyncedAt(millis: Long) {
        context.dataStore.edit { it[SHOWS_SYNCED_AT] = millis }
    }

    suspend fun clearShowsSyncedAt() {
        context.dataStore.edit { it.remove(SHOWS_SYNCED_AT) }
    }

    /**
     * Whether this device has fetched the catalogue with Patreon in it. A
     * build from before Patreon synced without asking for it, and its cursors
     * have moved past every Patreon row — so the first sync after updating
     * starts them all over. See SyncEngine.
     */
    suspend fun catalogueIncludesPatreon(): Boolean =
        context.dataStore.data.first()[CATALOGUE_INCLUDES_PATREON] ?: false

    suspend fun setCatalogueIncludesPatreon() {
        context.dataStore.edit { it[CATALOGUE_INCLUDES_PATREON] = true }
    }

    private suspend fun put(key: Preferences.Key<Boolean>, value: Boolean) {
        context.dataStore.edit { it[key] = value }
    }

    private companion object {
        val WIFI_ONLY = booleanPreferencesKey("downloadOverWiFiOnly")
        val CURRENT_EPISODE = booleanPreferencesKey("autoDownloadCurrentEpisode")
        val NEXT_EPISODE = booleanPreferencesKey("autoDownloadNextEpisode")
        val LAST_PLAYED = stringPreferencesKey("lastPlayedEpisodeGuid")
        val SHOWS_SYNCED_AT = longPreferencesKey("showsSyncedAt")
        val CATALOGUE_INCLUDES_PATREON = booleanPreferencesKey("catalogueIncludesPatreon")
    }
}
