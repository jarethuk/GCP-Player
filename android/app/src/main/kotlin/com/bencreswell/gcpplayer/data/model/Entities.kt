package com.bencreswell.gcpplayer.data.model

import android.content.res.Resources
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.bencreswell.gcpplayer.R

/**
 * The database schema, mirroring `iOS/GCP Player/Models.swift`.
 *
 * Deliberately absent: the iOS app's `downloadFileName` / `downloadedAt`
 * columns. Those exist only because `URLSession` offered no bookkeeping of
 * its own; Media3 keeps a `DownloadIndex` with state, progress and a `data`
 * blob, and mirroring that into Room would be duplicate truth. See
 * `playback/Downloads.kt`.
 */
@Entity(tableName = "shows", indices = [Index(value = ["title"], unique = true)])
data class ShowEntity(
    @PrimaryKey val slug: String,
    val title: String,
    /** Game system or campaign, e.g. "Pathfinder 2E" (display only). */
    val system: String? = null,
    val artworkUrl: String? = null,
    /**
     * The Patreon collection this show is posted into — the `show=` of a
     * patron's feed URL, which is where its Patreon audio comes from. null for
     * a show that isn't on Patreon.
     */
    val patreonShowId: String? = null,
    /** False for a show that exists only on Patreon. */
    @ColumnInfo(defaultValue = "1")
    val isPublic: Boolean = true,
    /**
     * The `syncedAt` from this show's last episode delta, as epoch millis.
     * Passed back as `since` so the next sync asks only for what changed.
     * null = this show's episodes have never been fetched, which is what
     * makes a run that failed partway through recoverable.
     */
    val episodesSyncedAt: Long? = null,
    /**
     * When this show last published, as epoch millis. Kept on the show so
     * the shows list can be sorted by it in SQL — working it out in the UI
     * would mean reading every episode of every show on each redraw.
     * [Long.MIN_VALUE] until the first sync fills it in.
     *
     * The newest episode of any kind, Patreon's included, whether or not this
     * device has a Patreon token: a show that has just published sorts to the
     * top either way. Only [latestPublicEpisodeAt] can make it NEW without one.
     */
    val latestEpisodeAt: Long = Long.MIN_VALUE,
    /** The newest episode anyone can play — one with public audio. */
    @ColumnInfo(defaultValue = "-9223372036854775808")
    val latestPublicEpisodeAt: Long = Long.MIN_VALUE,
    /** Starred by the user ("My Shows"). Never touched by syncing. */
    val isStarred: Boolean = false,
)

@Entity(
    tableName = "episodes",
    foreignKeys = [
        ForeignKey(
            entity = ShowEntity::class,
            parentColumns = ["slug"],
            childColumns = ["showSlug"],
            // Matches SwiftData's .nullify: deleting a show keeps its
            // episodes, unattributed, rather than deleting them.
            onDelete = ForeignKey.SET_NULL,
        )
    ],
    indices = [Index("showSlug"), Index("publishedAt"), Index("listedAt")],
)
data class EpisodeEntity(
    /** The RSS <guid> — the episode's stable identity, and the API's key too. */
    @PrimaryKey val guid: String,
    /** Cleaned title with show/system segments stripped, e.g. "Shaggy's Fight". */
    val title: String,
    /** The full original feed title, kept for auditing and re-parsing. */
    val rawTitle: String,
    val description: String? = null,
    /**
     * The public enclosure. null for an episode that so far exists only on
     * Patreon: its audio comes from the patron's own feed, fetched when it is
     * played or downloaded — see PatreonFeeds.
     */
    val audioUrl: String?,
    /**
     * The Patreon post, where the episode is on Patreon. With a token this is
     * the copy that plays, even when there is a public one: Patreon's has no ads.
     */
    val patreonPostId: String? = null,
    /** When Patreon published it — for an early release, months before [publishedAt]. */
    val patreonPublishedAt: Long? = null,
    val durationSeconds: Int? = null,
    /**
     * Patreon's runtime, learnt from the patron's feed the first time the
     * episode is played or downloaded from there. It differs from the public
     * one by the length of the ads it hasn't got.
     */
    val patreonDurationSeconds: Int? = null,
    val publishedAt: Long,
    /**
     * The date the episode is listed and ordered by: [patreonPublishedAt] when
     * this device has a Patreon token, [publishedAt] when it doesn't.
     *
     * Stored rather than worked out per query because every listing-order
     * query — the show's list, the next episode, "12 of 45", "mark previous
     * as played" — sorts on it in SQL. Rewritten in one statement whenever the
     * token changes and after every sync; see [EpisodeDao.refreshListedAt].
     */
    @ColumnInfo(defaultValue = "0")
    val listedAt: Long = publishedAt,
    val season: Int? = null,
    val number: Int? = null,
    val artworkUrl: String? = null,
    /**
     * The episode's video version on YouTube, where the network filmed one —
     * roughly half the catalogue. A link out rather than something this app
     * plays: see WatchOnYouTube.kt.
     */
    val videoUrl: String? = null,
    /** null = the episode couldn't be attributed to a show. Kept, not dropped. */
    val showSlug: String? = null,

    /** Listened-to flag. Local user state, never touched by syncing. */
    val isPlayed: Boolean = false,
    /** Where playback left off, in seconds, so an episode resumes rather than restarts. */
    val positionSeconds: Double = 0.0,
)

/**
 * Where an episode sits in its show, one-based — "12 of 45". The player shows
 * it on the phone, and the car's now-playing screen is a system template with
 * no text of its own, so this has to travel as metadata to appear there at all.
 */
data class EpisodePosition(val index: Int, val total: Int) {
    fun format(resources: Resources): String =
        resources.getString(R.string.player_position_in_show, index, total)
}

/**
 * A show plus the one count the shows list needs, straight out of SQL. Nothing
 * displays the count — it is what the NEW chip asks about.
 */
data class ShowWithCounts(
    val slug: String,
    val title: String,
    val system: String?,
    val artworkUrl: String?,
    val isPublic: Boolean,
    val latestEpisodeAt: Long,
    val latestPublicEpisodeAt: Long,
    val isStarred: Boolean,
    /** Unheard episodes this device can play — see [ShowDao.observeShowsWithCounts]. */
    val unplayedCount: Int,
)

/**
 * The one-row table holding the user's Patreon feed token. In the database,
 * beside the listening state, so the two travel together in a device backup.
 *
 * A removed token is kept as a row with a null [token] rather than deleted, so
 * the removal carries a time like the setting did.
 */
@Entity(tableName = "patreon_credential")
data class PatreonCredentialEntity(
    @PrimaryKey val key: String = SINGLETON_KEY,
    val token: String?,
    val updatedAt: Long,
) {
    companion object {
        const val SINGLETON_KEY = "patreon"
    }
}

/** On Patreon only, with no public audio yet: a Patreon-only show's episode, or an early release. */
val EpisodeEntity.isPatreonExclusive: Boolean get() = audioUrl == null && patreonPostId != null

/** Can't be played here: it is Patreon's alone, and there is no token to reach it with. */
fun EpisodeEntity.isLocked(hasToken: Boolean): Boolean = audioUrl == null && !hasToken

/**
 * Plays from the patron's feed rather than the public one — every Patreon
 * episode once there is a token, the public ones included, because Patreon's
 * copy has no ads.
 */
fun EpisodeEntity.playsFromPatreon(hasToken: Boolean): Boolean = patreonPostId != null && hasToken

/** The runtime of the copy that will actually play. */
fun EpisodeEntity.effectiveDurationSeconds(hasToken: Boolean): Int? =
    if (playsFromPatreon(hasToken)) patreonDurationSeconds ?: durationSeconds else durationSeconds

/** "42 min" — for list rows and the episode screen. */
fun EpisodeEntity.durationText(resources: Resources, hasToken: Boolean): String =
    effectiveDurationSeconds(hasToken)?.let { resources.getString(R.string.episode_duration, it / 60) } ?: ""

/**
 * The feed's descriptions are HTML. Crudely strip tags and the entities
 * that actually turn up, matching the iOS app's `plainDescription`.
 */
fun EpisodeEntity.plainDescription(): String? {
    val text = description ?: return null
    val stripped = text
        .replace(Regex("<[^>]+>"), " ")
        .replace("&amp;", "&")
        .replace("&nbsp;", " ")
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
        .replace(Regex("\\s+"), " ")
        .trim()
    return stripped.ifEmpty { null }
}
