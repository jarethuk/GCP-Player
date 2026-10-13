package com.bencreswell.gcpplayer.data.db

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.PatreonCredentialEntity
import com.bencreswell.gcpplayer.data.model.ShowEntity
import com.bencreswell.gcpplayer.data.model.ShowWithCounts
import kotlinx.coroutines.flow.Flow

@Dao
interface ShowDao {
    /**
     * Every show, most recently published first — the shows with something
     * new waiting are the ones you're looking for.
     *
     * The count is joined here rather than read per row in the UI: this is
     * the query the iOS app has to fake with a `fetchCount` per show, because
     * SwiftData won't aggregate a relationship.
     *
     * Without a Patreon token ([hasToken] false) padlocked episodes aren't
     * counted: an early release nobody here can play is not something new to
     * listen to.
     */
    @Query(
        """
        SELECT s.slug, s.title, s.system, s.artworkUrl, s.isPublic,
               s.latestEpisodeAt, s.latestPublicEpisodeAt, s.isStarred,
               COALESCE(SUM(CASE WHEN e.isPlayed = 0 AND (:hasToken OR e.audioUrl IS NOT NULL)
                                 THEN 1 ELSE 0 END), 0) AS unplayedCount
        FROM shows s
        LEFT JOIN episodes e ON e.showSlug = s.slug
        GROUP BY s.slug
        ORDER BY s.latestEpisodeAt DESC, s.title ASC
        """
    )
    fun observeShowsWithCounts(hasToken: Boolean): Flow<List<ShowWithCounts>>

    @Query("SELECT * FROM shows WHERE slug = :slug")
    fun observeShow(slug: String): Flow<ShowEntity?>

    @Query("SELECT * FROM shows")
    suspend fun all(): List<ShowEntity>

    /** Any show Patreon carries — what a pasted link is checked against. */
    @Query("SELECT patreonShowId FROM shows WHERE patreonShowId IS NOT NULL LIMIT 1")
    suspend fun anyPatreonShowId(): String?

    @Query("SELECT * FROM shows ORDER BY latestEpisodeAt DESC, title ASC")
    suspend fun allByRecency(): List<ShowEntity>

    @Upsert
    suspend fun upsert(shows: List<ShowEntity>)

    @Query("UPDATE shows SET isStarred = :starred WHERE slug = :slug")
    suspend fun setStarred(slug: String, starred: Boolean)

    /**
     * Stars a show only if it isn't already. Conditional in SQL rather than
     * read-then-write because this runs every time an episode starts: an
     * UPDATE that matches no row touches nothing, so Room's invalidation
     * doesn't fire and the shows list doesn't re-emit on every play.
     */
    @Query("UPDATE shows SET isStarred = 1 WHERE slug = :slug AND isStarred = 0")
    suspend fun starIfNeeded(slug: String)

    @Query("DELETE FROM shows WHERE slug IN (:slugs)")
    suspend fun delete(slugs: List<String>)

    @Query("DELETE FROM shows")
    suspend fun deleteAll()
}

@Dao
interface EpisodeDao {
    /**
     * Oldest first — the order you'd listen to a campaign in. By [EpisodeEntity.listedAt],
     * so a patron's list has each early release where Patreon put it.
     */
    @Query("SELECT * FROM episodes WHERE showSlug = :slug ORDER BY listedAt ASC, publishedAt ASC")
    fun observeForShow(slug: String): Flow<List<EpisodeEntity>>

    @Query("SELECT * FROM episodes WHERE showSlug = :slug ORDER BY listedAt ASC, publishedAt ASC")
    suspend fun forShow(slug: String): List<EpisodeEntity>

    /**
     * Points every row's [EpisodeEntity.listedAt] at the date this device lists
     * it by: Patreon's, with a token, where there is one; the public date
     * otherwise. One statement over ~2,000 rows — run after each sync and
     * whenever the token changes.
     */
    @Query(
        """
        UPDATE episodes SET listedAt = CASE
            WHEN :hasToken AND patreonPublishedAt IS NOT NULL THEN patreonPublishedAt
            ELSE publishedAt END
        """
    )
    suspend fun refreshListedAt(hasToken: Boolean)

    @Query("UPDATE episodes SET patreonDurationSeconds = :seconds WHERE guid = :guid")
    suspend fun setPatreonDuration(guid: String, seconds: Int)

    @Query("SELECT * FROM episodes WHERE guid = :guid")
    fun observeEpisode(guid: String): Flow<EpisodeEntity?>

    @Query("SELECT * FROM episodes WHERE guid = :guid")
    suspend fun episode(guid: String): EpisodeEntity?

    @Query("SELECT * FROM episodes")
    suspend fun all(): List<EpisodeEntity>

    @Query("SELECT guid FROM episodes")
    suspend fun allGuids(): List<String>

    @Upsert
    suspend fun upsert(episodes: List<EpisodeEntity>)

    @Query("UPDATE episodes SET isPlayed = :played, positionSeconds = 0 WHERE guid = :guid")
    suspend fun setPlayed(guid: String, played: Boolean)

    @Query("UPDATE episodes SET positionSeconds = :seconds WHERE guid = :guid")
    suspend fun setPosition(guid: String, seconds: Double)

    /**
     * Everything in the same show published before this one, unheard.
     * Returned rather than updated in place so the caller can also free
     * whatever those episodes had downloaded.
     */
    @Query(
        """
        SELECT * FROM episodes
        WHERE showSlug = (SELECT showSlug FROM episodes WHERE guid = :guid)
          AND listedAt < (SELECT listedAt FROM episodes WHERE guid = :guid)
          AND isPlayed = 0
        """
    )
    suspend fun previousUnplayed(guid: String): List<EpisodeEntity>

    /**
     * The episode after this one *within its show*, in listening order —
     * not feed order, which interleaves every show on the network.
     *
     * Padlocked episodes are stepped over when there is no token: running into
     * one would end the session on an episode that can't play.
     */
    @Query(
        """
        SELECT * FROM episodes
        WHERE showSlug = (SELECT showSlug FROM episodes WHERE guid = :guid)
          AND listedAt > (SELECT listedAt FROM episodes WHERE guid = :guid)
          AND (:hasToken OR audioUrl IS NOT NULL)
        ORDER BY listedAt ASC
        LIMIT 1
        """
    )
    suspend fun nextInShow(guid: String, hasToken: Boolean): EpisodeEntity?

    @Query("SELECT MAX(publishedAt) FROM episodes WHERE showSlug = :slug")
    suspend fun latestPublishedAt(slug: String): Long?

    @Query("SELECT MAX(publishedAt) FROM episodes WHERE showSlug = :slug AND audioUrl IS NOT NULL")
    suspend fun latestPublicPublishedAt(slug: String): Long?

    @Query("SELECT COUNT(*) FROM episodes WHERE showSlug = :slug")
    suspend fun countForShow(slug: String): Int

    @Query("DELETE FROM episodes WHERE guid IN (:guids)")
    suspend fun delete(guids: List<String>)

    @Query("DELETE FROM episodes")
    suspend fun deleteAll()

    /**
     * How many of the show's episodes came out before this one — the index
     * half of the player's "12 of 45". Counted in SQL rather than by reading
     * the show's episodes, which on the main feed is over a thousand rows to
     * answer a two-number question.
     */
    @Query(
        """
        SELECT COUNT(*) FROM episodes
        WHERE showSlug = (SELECT showSlug FROM episodes WHERE guid = :guid)
          AND listedAt < (SELECT listedAt FROM episodes WHERE guid = :guid)
        """
    )
    suspend fun countEarlierInShow(guid: String): Int
}

@Dao
interface PatreonDao {
    @Query("SELECT * FROM patreon_credential LIMIT 1")
    fun observe(): Flow<PatreonCredentialEntity?>

    @Query("SELECT * FROM patreon_credential LIMIT 1")
    suspend fun current(): PatreonCredentialEntity?

    @Upsert
    suspend fun upsert(credential: PatreonCredentialEntity)
}
