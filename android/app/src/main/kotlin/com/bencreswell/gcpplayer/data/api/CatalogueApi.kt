package com.bencreswell.gcpplayer.data.api

import android.content.Context
import com.bencreswell.gcpplayer.BuildConfig
import com.bencreswell.gcpplayer.R
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** The catalogue answered, but not with an answer. */
class ApiException(val status: Int, message: String) : IOException(message)

/**
 * What the sync engine needs of the catalogue, and nothing else.
 *
 * Split from [CatalogueApi] for the reason `FeedSyncEngine` split `apply` from
 * `sync`: the interesting logic is what the answers do to the database, and
 * that should be exercisable with any set of answers, no networking required.
 */
interface Catalogue {
    suspend fun shows(since: Long?): ShowsResponse
    suspend fun episodes(showSlug: String, since: Long?): EpisodesResponse
}

/**
 * Talks to the catalogue API in `../../api`. That service reads the network's
 * nine RSS feeds and reconciles them; the app no longer parses feeds itself.
 *
 * Both endpoints are deltas: pass the `syncedAt` from the previous response as
 * `since` and only what changed since comes back. The app still keeps a full
 * local copy — working with no signal is most of the point — so this is about
 * keeping that copy current cheaply, not about fetching on demand.
 *
 * Responses are cached at the edge for an hour, so most of these calls never
 * reach the API's database.
 */
@Singleton
class CatalogueApi @Inject constructor(
    private val http: OkHttpClient,
    @ApplicationContext private val context: Context,
) : Catalogue {

    private val baseUrl: HttpUrl = BuildConfig.API_BASE_URL.toHttpUrl()

    /**
     * The shows that changed since [since], tombstones included. Pass null on a
     * first sync to get the whole catalogue.
     *
     * Which shows come back is the *only* signal the app needs about what to
     * look at next: the API marks a show whenever its episodes change, not only
     * when its own fields are edited, so a show that isn't here has nothing new
     * underneath it either.
     */
    override suspend fun shows(since: Long?): ShowsResponse =
        CatalogueJson.shows(get(baseUrl.newBuilder().addPathSegment("shows"), since))

    /**
     * One show's episodes, changed since [since]. Addressed by slug — the API
     * accepts either its own id or the slug, and the slug is what the local
     * store already keys on.
     */
    override suspend fun episodes(showSlug: String, since: Long?): EpisodesResponse =
        CatalogueJson.episodes(
            get(
                baseUrl.newBuilder()
                    .addPathSegment("shows")
                    .addPathSegment(showSlug)
                    .addPathSegment("episodes"),
                since,
            )
        )

    /**
     * Both calls ask for Patreon (`patreon=1`): Patreon-only shows, and
     * episodes with no public audio. Without it the API answers as it did for
     * the builds that predate Patreon.
     */
    private suspend fun get(builder: HttpUrl.Builder, since: Long?): String =
        withContext(Dispatchers.IO) {
            builder.addQueryParameter("patreon", "1")
            if (since != null) {
                // Milliseconds included: the cursor is compared with `>` against
                // a millisecond-precision column, and a truncated one would
                // re-fetch the boundary row on every sync.
                builder.addQueryParameter("since", Instant.ofEpochMilli(since).toString())
            }
            val request = Request.Builder()
                .url(builder.build())
                .header("accept", "application/json")
                .build()

            http.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw ApiException(
                        response.code,
                        context.getString(R.string.errors_catalogue_status, response.code),
                    )
                }
                body
            }
        }
}
