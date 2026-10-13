package com.bencreswell.gcpplayer.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.bencreswell.gcpplayer.data.api.CatalogueJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

/**
 * The wire format, against answers actually taken off the API rather than
 * against a hand-written idea of them — `assets/shows.json` and
 * `assets/episodes.json` were captured from a running instance.
 *
 * An instrumentation test, not a JVM one, because `org.json` is a platform
 * class: the desktop jar is a stub whose every method throws, and the Maven
 * artifact is a different implementation from the one that will actually parse
 * these bytes on a phone.
 */
@RunWith(AndroidJUnit4::class)
class CatalogueJsonTest {

    private fun asset(name: String): String =
        InstrumentationRegistry.getInstrumentation().context.assets
            .open(name).bufferedReader().use { it.readText() }

    @Test
    fun readsTheShowsEnvelope() {
        val response = CatalogueJson.shows(asset("shows.json"))

        assertTrue(response.fullResync)
        assertEquals(3, response.shows.size)
        assertEquals(
            Instant.parse("2026-09-18T13:30:25.528Z").toEpochMilli(),
            response.syncedAt,
        )
    }

    @Test
    fun readsAShow() {
        val show = CatalogueJson.shows(asset("shows.json")).shows.first()

        assertEquals("side-quest-side-sesh", show.slug)
        assertEquals("Side Quest Side Sesh", show.title)
        assertEquals("Pathfinder 2E", show.system)
        assertTrue(show.artworkUrl.orEmpty().startsWith("https://"))
        // A JSON null has to arrive as a Kotlin null, not as the four
        // characters "null" — which is what `optString` would have given.
        assertNull(show.description)
        assertNull(show.deletedAt)
    }

    @Test
    fun readsAnEpisode() {
        val episode = CatalogueJson.episodes(asset("episodes.json")).episodes.first()

        assertEquals("Enter the Dusk", episode.title)
        assertEquals("Enter the Dusk | Haunted City S1 E1 | Blades in the Dark", episode.rawTitle)
        assertEquals(1, episode.season)
        assertEquals(1, episode.number)
        assertTrue("a duration is expected", (episode.durationSeconds ?: 0) > 0)
        assertNull(episode.deletedAt)
    }

    @Test
    fun turnsTimestampsIntoEpochMillis() {
        val episode = CatalogueJson.episodes(asset("episodes.json")).episodes.first()

        assertEquals(
            Instant.parse("2022-02-25T05:00:00.000Z").toEpochMilli(),
            episode.publishedAt,
        )
        // Milliseconds survive, to the millisecond. The cursor is compared with
        // `>` against a millisecond-precision column, so one truncated to the
        // second would re-fetch the boundary row on every single sync.
        assertEquals(
            Instant.parse("2026-09-18T12:10:12.081Z").toEpochMilli(),
            episode.updatedAt,
        )
        assertEquals(81L, episode.updatedAt % 1000L)
    }

    @Test
    fun readsATombstone() {
        val tombstone = """
            {"syncedAt":"2026-09-18T13:30:25.528Z","fullResync":false,"shows":[
              {"id":"x","slug":"gone","title":"Gone","system":null,"description":null,
               "artworkUrl":null,"createdAt":"2026-01-01T00:00:00.000Z",
               "updatedAt":"2026-09-01T00:00:00.000Z","deletedAt":"2026-09-01T00:00:00.000Z"}]}
        """.trimIndent()

        val show = CatalogueJson.shows(tombstone).shows.single()
        assertEquals(
            Instant.parse("2026-09-01T00:00:00.000Z").toEpochMilli(),
            show.deletedAt,
        )
    }

    @Test
    fun readsAnEmptyDelta() {
        // The commonest answer of all: a launch with nothing new. It still
        // carries a cursor, and that cursor still has to advance.
        val empty = """{"syncedAt":"2026-09-18T13:30:25.528Z","fullResync":false,"shows":[]}"""
        val response = CatalogueJson.shows(empty)

        assertTrue(response.shows.isEmpty())
        assertEquals(Instant.parse("2026-09-18T13:30:25.528Z").toEpochMilli(), response.syncedAt)
    }
}
