package com.bencreswell.gcpplayer.data.patreon

import android.content.Context
import android.content.res.Resources
import android.util.Log
import android.util.Xml
import com.bencreswell.gcpplayer.R
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.xmlpull.v1.XmlPullParser
import java.io.IOException
import java.io.InputStream
import javax.inject.Inject
import javax.inject.Singleton

/** One episode's Patreon audio, as the patron's feed describes it. */
data class PatreonAudio(val url: String, val durationSeconds: Int?)

/** Why Patreon audio couldn't be had. The message is what the screen says. */
class PatreonException(message: String) : IOException(message) {
    companion object {
        fun noToken(resources: Resources) =
            PatreonException(resources.getString(R.string.patreon_error_no_token))
        fun notOnPatreon(resources: Resources) =
            PatreonException(resources.getString(R.string.patreon_error_not_on_patreon))
        fun notInFeed(resources: Resources) =
            PatreonException(resources.getString(R.string.patreon_error_not_in_feed))
        fun rejected(resources: Resources, status: Int) = PatreonException(
            if (status == 401 || status == 403 || status == 404) {
                resources.getString(R.string.patreon_error_rejected)
            } else {
                resources.getString(R.string.patreon_error_status, status)
            }
        )
    }
}

/**
 * The patron's feeds, one per show, fetched when something needs audio from
 * them and kept for a while — a show's feed is a few hundred kilobytes, and
 * playing then downloading the next episode asks for the same one twice.
 *
 * Items are keyed by Patreon post id, which is what the API calls
 * `patreonPostId` — read from the item's `<link>`, not its `<guid>`. The guid
 * is the post id only for posts made on Patreon; the network's back catalogue
 * was imported from Supercast and kept Supercast's guids, a URL each — 178 of
 * Blood of the Wild's 203. The link is always the post's page, ending
 * `-<post id>`.
 */
@Singleton
class PatreonFeeds @Inject constructor(
    private val http: OkHttpClient,
    @ApplicationContext private val context: Context,
) {

    private class Cached(val fetchedAt: Long, val token: String, val items: Map<String, PatreonAudio>)

    private val feeds = mutableMapOf<String, Cached>()
    private val mutex = Mutex()

    /**
     * The audio of [postId] in show [showId]'s feed. Served from the cached
     * copy when it's fresh; a post missing from it fetches again, since it may
     * have been published since.
     */
    suspend fun audio(token: String, showId: String, postId: String): PatreonAudio {
        feed(showId, token, allowCached = true)[postId]?.let { return it }
        return feed(showId, token, allowCached = false)[postId] ?: throw PatreonException.notInFeed(context.resources)
    }

    /**
     * Whether [token] opens this show's feed — asked before a pasted link is
     * kept, so a wrong one is caught on the Settings screen rather than on the
     * first play.
     */
    suspend fun check(token: String, showId: String) {
        if (fetch(showId, token).isEmpty()) throw PatreonException.rejected(context.resources, 403)
    }

    /** Drops everything fetched — the URLs inside carry the old token. */
    suspend fun forget() = mutex.withLock { feeds.clear() }

    private suspend fun feed(showId: String, token: String, allowCached: Boolean): Map<String, PatreonAudio> =
        mutex.withLock {
            val cached = feeds[showId]
            if (allowCached && cached != null && cached.token == token &&
                System.currentTimeMillis() - cached.fetchedAt < LIFETIME_MILLIS
            ) {
                return cached.items
            }
            val items = fetch(showId, token)
            feeds[showId] = Cached(System.currentTimeMillis(), token, items)
            items
        }

    private suspend fun fetch(showId: String, token: String): Map<String, PatreonAudio> =
        withContext(Dispatchers.IO) {
            val url = PatreonAccount.FEED_BASE.toHttpUrl().newBuilder()
                .addQueryParameter("auth", token)
                .addQueryParameter("show", showId)
                .build()
            http.newCall(Request.Builder().url(url).build()).execute().use { response ->
                if (!response.isSuccessful) throw PatreonException.rejected(context.resources, response.code)
                val items = parse(response.body!!.byteStream())
                Log.i(TAG, "feed for show $showId: ${items.size} items")
                items
            }
        }

    companion object {
        private const val TAG = "Patreon"

        /** Long enough to cover a listening session, short enough to see a new post. */
        private const val LIFETIME_MILLIS = 30 * 60 * 1000L

        /** Each item's post id, enclosure and `<itunes:duration>`. */
        fun parse(stream: InputStream): Map<String, PatreonAudio> {
            val parser = Xml.newPullParser()
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            parser.setInput(stream, null)

            val items = mutableMapOf<String, PatreonAudio>()
            var inItem = false
            var guid: String? = null
            var link: String? = null
            var enclosure: String? = null
            var duration: Int? = null

            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                when (parser.eventType) {
                    XmlPullParser.START_TAG -> when (parser.name) {
                        "item" -> { inItem = true; guid = null; link = null; enclosure = null; duration = null }
                        "guid" -> if (inItem) guid = parser.nextText().trim()
                        "link" -> if (inItem) link = parser.nextText().trim()
                        "enclosure" -> if (inItem) enclosure = parser.getAttributeValue(null, "url")
                        "itunes:duration" -> if (inItem) duration = seconds(parser.nextText().trim())
                    }
                    XmlPullParser.END_TAG -> if (parser.name == "item") {
                        inItem = false
                        val id = link?.let(::postId) ?: guid?.takeIf { it.all(Char::isDigit) }
                        val url = enclosure
                        if (id != null && url != null) items[id] = PatreonAudio(url, duration)
                    }
                }
            }
            return items
        }

        /** `https://www.patreon.com/glasscannon/posts/war-breaks-out-154017528` → `154017528`. */
        fun postId(link: String): String? =
            Regex("""/posts/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)""").find(link)?.groupValues?.get(1)

        /** `4353`, `72:33` or `1:12:33`. */
        private fun seconds(value: String): Int? {
            val parts = value.split(":").map { it.toIntOrNull() ?: return null }
            if (parts.isEmpty() || parts.size > 3) return null
            return parts.fold(0) { total, part -> total * 60 + part }
        }
    }
}
