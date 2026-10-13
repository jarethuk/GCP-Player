package com.bencreswell.gcpplayer.data.patreon

import androidx.core.net.toUri
import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.db.PatreonDao
import com.bencreswell.gcpplayer.data.model.PatreonCredentialEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The user's Patreon feed token — the one thing standing between a padlocked
 * episode and its audio. A port of the iOS app's `PatreonAccount`.
 *
 * The API knows every Patreon episode but never has their audio: that lives in
 * each patron's personal RSS feed, whose URL carries their own token. So the
 * token is pasted into Settings once, kept in the database, and used to ask
 * that feed for an episode's audio at the moment it is played or downloaded.
 * Nothing about it goes near the API.
 *
 * Kept in Room rather than DataStore so it travels with the listening state in
 * a device backup: on a new phone restored from this one, Patreon comes back
 * unlocked along with everything played. See `res/xml/backup_rules.xml`.
 */
@Singleton
class PatreonAccount @Inject constructor(
    private val dao: PatreonDao,
    private val episodeDao: EpisodeDao,
    private val feeds: PatreonFeeds,
) {
    /** The token, or null. Never logged. */
    val token: Flow<String?> = dao.observe().map { it?.token }.distinctUntilChanged()

    /** Whether Patreon episodes can play here — what locks and unlocks them. */
    val hasToken: Flow<Boolean> = token.map { it != null }.distinctUntilChanged()

    suspend fun currentToken(): String? = dao.current()?.token

    suspend fun hasToken(): Boolean = currentToken() != null

    /**
     * Sets or clears the token. The listing dates move with it — a patron's
     * list is ordered by when Patreon published each episode — and anything
     * fetched with the old token is forgotten.
     */
    suspend fun setToken(token: String?) {
        dao.upsert(PatreonCredentialEntity(token = token, updatedAt = System.currentTimeMillis()))
        feeds.forget()
        episodeDao.refreshListedAt(token != null)
    }

    companion object {
        /** The creator's feed; the name is what Patreon's own "copy RSS link" hands out. */
        const val FEED_BASE = "https://www.patreon.com/rss/glasscannon"

        /**
         * Takes the token out of a pasted feed link. Anything Patreon hands out
         * works — the link from "Copy RSS link", with or without `&show=`, or
         * the URL of a single episode's audio (`/api/rss/u/<token>/e/…`). null
         * if there is no token in it.
         */
        fun tokenFromFeedLink(text: String): String? {
            val uri = runCatching { text.trim().toUri() }.getOrNull() ?: return null
            if (uri.host?.endsWith("patreon.com") != true) return null

            uri.getQueryParameter("auth")?.takeIf(::isPlausible)?.let { return it }

            val segments = uri.pathSegments
            val index = segments.indexOf("u")
            if (index >= 2 && index + 1 < segments.size &&
                segments[index - 2] == "api" && segments[index - 1] == "rss"
            ) {
                segments[index + 1].takeIf(::isPlausible)?.let { return it }
            }
            return null
        }

        private fun isPlausible(token: String): Boolean =
            token.length >= 16 && token.all { it.isLetterOrDigit() || it == '-' || it == '_' }
    }
}
