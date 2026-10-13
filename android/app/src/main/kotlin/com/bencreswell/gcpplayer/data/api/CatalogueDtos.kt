package com.bencreswell.gcpplayer.data.api

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * The catalogue API's wire types, mirroring `iOS/GCP Player/APIClient.swift`.
 *
 * Timestamps are ISO-8601 with milliseconds on the wire and epoch millis in
 * here, which is what Room already stores — so nothing downstream has to know
 * the API sends strings.
 */
data class ShowDto(
    val id: String,
    val slug: String,
    val title: String,
    val system: String?,
    val description: String?,
    val artworkUrl: String?,
    /** The Patreon collection — the `show=` of a patron's feed URL. */
    val patreonShowId: String?,
    /** False for a show that exists only on Patreon. */
    val isPublic: Boolean,
    val updatedAt: Long,
    /** Non-null means this row is a tombstone: drop the local copy. */
    val deletedAt: Long?,
)

data class EpisodeDto(
    val id: String,
    val showId: String?,
    val guid: String,
    val title: String,
    val rawTitle: String,
    val description: String?,
    /** null for an episode that is so far only on Patreon. */
    val audioUrl: String?,
    /** The Patreon post — the `<guid>` of the item in a patron's feed. */
    val patreonPostId: String?,
    /** When Patreon published it; a patron's list is ordered by this. */
    val patreonPublishedAt: Long?,
    val durationSeconds: Int?,
    val publishedAt: Long,
    val season: Int?,
    val number: Int?,
    val artworkUrl: String?,
    /** The episode's video version on YouTube, where the feed mentions one. */
    val videoUrl: String?,
    val updatedAt: Long,
    /**
     * Non-null means this row is a tombstone: drop the local copy, and
     * whatever was downloaded of it.
     */
    val deletedAt: Long?,
)

/**
 * The envelope both endpoints return.
 *
 * [syncedAt] is the highest `updatedAt` the server actually holds rather than
 * its clock, so storing it and passing it back can't skip a row that committed
 * moments after the response was built. It is also the *collection's* maximum
 * rather than this response's, which is what makes two devices that last synced
 * at different times converge on one URL — and so on one edge-cached answer.
 */
data class ShowsResponse(val syncedAt: Long, val fullResync: Boolean, val shows: List<ShowDto>)

data class EpisodesResponse(
    val syncedAt: Long,
    val fullResync: Boolean,
    val episodes: List<EpisodeDto>,
)

/**
 * Reads the two envelopes.
 *
 * Hand-written against the platform's `org.json` rather than reflective or
 * generated binding, for the same reason `FeedParser` used `XmlPullParser`:
 * it is two shapes, it needs no dependency, and this project has twice been
 * stopped by a library whose Kotlin metadata the toolchain couldn't read.
 */
object CatalogueJson {

    fun shows(text: String): ShowsResponse {
        val root = JSONObject(text)
        return ShowsResponse(
            syncedAt = root.timestamp("syncedAt"),
            fullResync = root.optBoolean("fullResync", false),
            shows = root.optJSONArray("shows").map(::show),
        )
    }

    fun episodes(text: String): EpisodesResponse {
        val root = JSONObject(text)
        return EpisodesResponse(
            syncedAt = root.timestamp("syncedAt"),
            fullResync = root.optBoolean("fullResync", false),
            episodes = root.optJSONArray("episodes").map(::episode),
        )
    }

    private fun show(json: JSONObject) = ShowDto(
        id = json.getString("id"),
        slug = json.getString("slug"),
        title = json.getString("title"),
        system = json.stringOrNull("system"),
        description = json.stringOrNull("description"),
        artworkUrl = json.stringOrNull("artworkUrl"),
        patreonShowId = json.stringOrNull("patreonShowId"),
        // Absent from an API that predates Patreon, where every show was public.
        isPublic = json.optBoolean("isPublic", true),
        updatedAt = json.timestamp("updatedAt"),
        deletedAt = json.timestampOrNull("deletedAt"),
    )

    private fun episode(json: JSONObject) = EpisodeDto(
        id = json.getString("id"),
        showId = json.stringOrNull("showId"),
        guid = json.getString("guid"),
        title = json.getString("title"),
        rawTitle = json.optString("rawTitle").ifEmpty { json.getString("title") },
        description = json.stringOrNull("description"),
        audioUrl = json.stringOrNull("audioUrl"),
        patreonPostId = json.stringOrNull("patreonPostId"),
        patreonPublishedAt = json.timestampOrNull("patreonPublishedAt"),
        durationSeconds = json.intOrNull("durationSeconds"),
        publishedAt = json.timestamp("publishedAt"),
        season = json.intOrNull("season"),
        number = json.intOrNull("number"),
        artworkUrl = json.stringOrNull("artworkUrl"),
        // stringOrNull answers null for a key that isn't there at all, so a
        // build talking to an API that predates the column reads it as "no
        // video" rather than failing the sync.
        videoUrl = json.stringOrNull("videoUrl"),
        updatedAt = json.timestamp("updatedAt"),
        deletedAt = json.timestampOrNull("deletedAt"),
    )
}

/**
 * `optString` answers "" for a missing key *and* the four characters "null"
 * for a JSON null, either of which would be stored as a real value — so every
 * nullable field is read through here instead.
 */
private fun JSONObject.stringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).ifEmpty { null }

private fun JSONObject.intOrNull(key: String): Int? = if (isNull(key)) null else optInt(key)

private fun JSONObject.timestamp(key: String): Long = Instant.parse(getString(key)).toEpochMilli()

private fun JSONObject.timestampOrNull(key: String): Long? =
    if (isNull(key)) null else Instant.parse(getString(key)).toEpochMilli()


private fun <T> JSONArray?.map(transform: (JSONObject) -> T): List<T> {
    if (this == null) return emptyList()
    return (0 until length()).map { transform(getJSONObject(it)) }
}
