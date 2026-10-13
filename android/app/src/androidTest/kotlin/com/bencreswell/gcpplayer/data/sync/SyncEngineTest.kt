package com.bencreswell.gcpplayer.data.sync

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.bencreswell.gcpplayer.data.api.Catalogue
import com.bencreswell.gcpplayer.data.api.EpisodeDto
import com.bencreswell.gcpplayer.data.api.EpisodesResponse
import com.bencreswell.gcpplayer.data.api.ShowDto
import com.bencreswell.gcpplayer.data.api.ShowsResponse
import com.bencreswell.gcpplayer.data.db.GcpDatabase
import com.bencreswell.gcpplayer.data.patreon.PatreonAccount
import com.bencreswell.gcpplayer.data.patreon.PatreonFeeds
import com.bencreswell.gcpplayer.data.settings.SettingsStore
import com.bencreswell.gcpplayer.playback.DownloadEraser
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The rules that decide what a delta does to the local copy.
 *
 * Driven through [SyncEngine.apply] rather than `sync`, so the cursor comes
 * from the test rather than from the device's settings and nothing here writes
 * to the real app's DataStore. The catalogue is a stand-in that also records
 * what was asked for — which is half of what these tests are checking, because
 * "only ask for the shows that changed" is a claim about requests, not rows.
 */
@UnstableApi
@RunWith(AndroidJUnit4::class)
class SyncEngineTest {

    private lateinit var db: GcpDatabase
    private lateinit var catalogue: FakeCatalogue
    private lateinit var engine: SyncEngine
    private lateinit var patreon: PatreonAccount
    private val erased = mutableListOf<String>()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, GcpDatabase::class.java).build()
        catalogue = FakeCatalogue()
        patreon = PatreonAccount(db.patreonDao(), db.episodeDao(), PatreonFeeds(OkHttpClient(), context))
        engine = engine(catalogue)
    }

    private fun engine(api: Catalogue) = SyncEngine(
        api = api,
        showDao = db.showDao(),
        episodeDao = db.episodeDao(),
        downloads = DownloadEraser { erased += it },
        // Never reached by `apply`; sync() is the only caller that stores.
        settings = SettingsStore(ApplicationProvider.getApplicationContext()),
        patreon = patreon,
    )

    @After
    fun tearDown() = db.close()

    // -- helpers ---------------------------------------------------------

    private fun show(
        slug: String,
        title: String = slug,
        deletedAt: Long? = null,
        isPublic: Boolean = true,
        patreonShowId: String? = null,
    ) = ShowDto(
        id = slug, slug = slug, title = title, system = null, description = null,
        artworkUrl = null, patreonShowId = patreonShowId, isPublic = isPublic,
        updatedAt = 1_000L, deletedAt = deletedAt,
    )

    private fun episode(
        guid: String,
        publishedAt: Long = 1_000L,
        deletedAt: Long? = null,
        videoUrl: String? = null,
        /** False for a Patreon-only episode: no public audio. */
        public: Boolean = true,
        patreonPostId: String? = null,
        patreonPublishedAt: Long? = null,
    ) = EpisodeDto(
        id = guid, showId = null, guid = guid, title = guid, rawTitle = guid,
        description = null, audioUrl = if (public) "https://cdn.example/$guid.mp3" else null,
        patreonPostId = patreonPostId, patreonPublishedAt = patreonPublishedAt,
        durationSeconds = 60, publishedAt = publishedAt, season = null, number = null,
        artworkUrl = null, videoUrl = videoUrl, updatedAt = 1_000L, deletedAt = deletedAt,
    )

    private class FakeCatalogue : Catalogue {
        var shows = ShowsResponse(syncedAt = 1_000L, fullResync = true, shows = emptyList())
        var episodes = mutableMapOf<String, EpisodesResponse>()

        /** Every `since` this was called with, so requests can be asserted on. */
        val showsAsked = mutableListOf<Long?>()
        val episodesAsked = mutableListOf<Pair<String, Long?>>()

        override suspend fun shows(since: Long?): ShowsResponse {
            showsAsked += since
            return shows
        }

        override suspend fun episodes(showSlug: String, since: Long?): EpisodesResponse {
            episodesAsked += showSlug to since
            return episodes[showSlug]
                ?: EpisodesResponse(syncedAt = 1_000L, fullResync = true, episodes = emptyList())
        }
    }

    // -- tests -----------------------------------------------------------

    @Test
    fun firstSyncStoresTheWholeCatalogue() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("haunted-city")))
        catalogue.episodes["haunted-city"] =
            EpisodesResponse(3_000L, true, listOf(episode("g1"), episode("g2")))

        val (result, cursor) = engine.apply(since = null)

        assertEquals(1, result.showsCreated)
        assertEquals(2, result.episodesCreated)
        // The cursor handed back is the server's, not a clock reading.
        assertEquals(2_000L, cursor)
        assertEquals(2, db.episodeDao().all().size)
    }

    // The video link is what the "Watch on YouTube" button hangs off, and it
    // arrives the same way every other server-owned field does — so it has to
    // survive the trip and, since the server owns it, be able to go away again.
    @Test
    fun theVideoLinkArrivesAndCanBeTakenBack() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("haunted-city")))
        catalogue.episodes["haunted-city"] = EpisodesResponse(
            3_000L,
            true,
            listOf(episode("g1", videoUrl = "https://youtu.be/eYkJB2rjUNo"), episode("g2")),
        )

        engine.apply(since = null)

        val stored = db.episodeDao().all().associateBy { it.guid }
        assertEquals("https://youtu.be/eYkJB2rjUNo", stored["g1"]?.videoUrl)
        // An episode the network never filmed, which is about half of them.
        assertNull(stored["g2"]?.videoUrl)

        // The same episode again, now without one — a video pulled down, or a
        // link corrected away in the dashboard.
        catalogue.shows = ShowsResponse(4_000L, false, listOf(show("haunted-city")))
        catalogue.episodes["haunted-city"] =
            EpisodesResponse(5_000L, false, listOf(episode("g1")))

        engine.apply(since = 2_000L)

        assertNull(db.episodeDao().all().first { it.guid == "g1" }.videoUrl)
    }

    @Test
    fun theShowsCursorIsPassedStraightThrough() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, false, emptyList())

        engine.apply(since = 1_234L)

        assertEquals(listOf<Long?>(1_234L), catalogue.showsAsked)
    }

    @Test
    fun onlyShowsThatChangedAreLookedInside() = runBlocking {
        // Two shows and their episodes, synced.
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("a"), show("b")))
        catalogue.episodes["a"] = EpisodesResponse(3_000L, true, listOf(episode("a1")))
        catalogue.episodes["b"] = EpisodesResponse(3_000L, true, listOf(episode("b1")))
        engine.apply(since = null)
        catalogue.episodesAsked.clear()

        // Now only "a" comes back in the delta.
        catalogue.shows = ShowsResponse(4_000L, false, listOf(show("a")))
        val (result, _) = engine.apply(since = 2_000L)

        assertEquals(listOf("a"), catalogue.episodesAsked.map { it.first })
        assertEquals(1, result.showsChecked)
        // And it asks from where that show left off, not from the start.
        assertEquals(3_000L, catalogue.episodesAsked.single().second)
    }

    @Test
    fun aShowWhoseEpisodesNeverArrivedIsRetried() = runBlocking {
        // "b"'s episode fetch fails, so its cursor is never set.
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("a"), show("b")))
        catalogue.episodes["a"] = EpisodesResponse(3_000L, true, listOf(episode("a1")))
        val failing = object : Catalogue by catalogue {
            override suspend fun episodes(showSlug: String, since: Long?): EpisodesResponse {
                if (showSlug == "b") throw IllegalStateException("down")
                return catalogue.episodes(showSlug, since)
            }
        }
        val first = engine(failing).apply(since = null)
        assertEquals(listOf("b"), first.first.failedShows)

        // The next run brings nothing new, but "b" is asked for anyway.
        catalogue.shows = ShowsResponse(4_000L, false, emptyList())
        catalogue.episodesAsked.clear()
        engine.apply(since = 2_000L)

        assertEquals(listOf("b"), catalogue.episodesAsked.map { it.first })
        assertNull(catalogue.episodesAsked.single().second)
    }

    @Test
    fun aTombstonedShowTakesItsEpisodesAndTheirFiles() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("a")))
        catalogue.episodes["a"] = EpisodesResponse(3_000L, true, listOf(episode("a1")))
        engine.apply(since = null)

        catalogue.shows = ShowsResponse(4_000L, false, listOf(show("a", deletedAt = 4_000L)))
        val (result, _) = engine.apply(since = 2_000L)

        assertEquals(1, result.showsRemoved)
        assertTrue(db.showDao().all().isEmpty())
        assertTrue(db.episodeDao().all().isEmpty())
        assertEquals(listOf("a1"), erased)
    }

    @Test
    fun aTombstonedEpisodeGoesAndItsShowIsRedated() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("a")))
        catalogue.episodes["a"] = EpisodesResponse(
            3_000L, true, listOf(episode("a1", publishedAt = 100L), episode("a2", publishedAt = 900L)),
        )
        engine.apply(since = null)
        assertEquals(900L, db.showDao().all().single().latestEpisodeAt)

        // The newest one is withdrawn.
        catalogue.shows = ShowsResponse(4_000L, false, listOf(show("a")))
        catalogue.episodes["a"] =
            EpisodesResponse(5_000L, false, listOf(episode("a2", deletedAt = 5_000L)))
        val (result, _) = engine.apply(since = 2_000L)

        assertEquals(1, result.episodesRemoved)
        assertEquals(listOf("a1"), db.episodeDao().all().map { it.guid })
        // Folding a maximum only ever moves it forwards, so this has to be
        // recomputed — otherwise the show keeps a NEW chip for days.
        assertEquals(100L, db.showDao().all().single().latestEpisodeAt)
    }

    @Test
    fun localStateSurvivesAnUpdate() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("a")))
        catalogue.episodes["a"] = EpisodesResponse(3_000L, true, listOf(episode("a1")))
        engine.apply(since = null)

        db.showDao().setStarred("a", true)
        db.episodeDao().setPlayed("a1", true)
        db.episodeDao().setPosition("a1", 42.0)

        // The same rows come back, retitled.
        catalogue.shows = ShowsResponse(4_000L, false, listOf(show("a", title = "A, renamed")))
        catalogue.episodes["a"] = EpisodesResponse(5_000L, false, listOf(episode("a1")))
        engine.apply(since = 2_000L)

        val stored = db.showDao().all().single()
        assertEquals("A, renamed", stored.title)
        assertTrue("starring is this device's", stored.isStarred)
        val episode = db.episodeDao().all().single()
        assertTrue("played is this device's", episode.isPlayed)
        assertEquals(42.0, episode.positionSeconds, 0.001)
    }

    @Test
    fun aFullAnswerIsAlsoACompleteOne() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("a"), show("b")))
        engine.apply(since = null)
        assertEquals(2, db.showDao().all().size)

        // "b" is simply absent this time, with no tombstone — which is what a
        // device that missed one looks like, and what recovers it.
        catalogue.shows = ShowsResponse(4_000L, true, listOf(show("a")))
        engine.apply(since = null)

        assertEquals(listOf("a"), db.showDao().all().map { it.slug })
    }

    // -- Patreon ---------------------------------------------------------

    /**
     * A public show whose Patreon copies came out months earlier, and one
     * early release the public feed hasn't caught up with.
     */
    private suspend fun patreonCatalogue() {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("wsba", patreonShowId = "2073644")))
        catalogue.episodes["wsba"] = EpisodesResponse(
            3_000L,
            true,
            listOf(
                episode("e1", publishedAt = 5_000L, patreonPostId = "1", patreonPublishedAt = 1_000L),
                episode("debrief1", publishedAt = 1_100L, public = false, patreonPostId = "2", patreonPublishedAt = 1_100L),
                episode("e2", publishedAt = 6_000L, patreonPostId = "3", patreonPublishedAt = 2_000L),
                episode("early", publishedAt = 3_000L, public = false, patreonPostId = "4", patreonPublishedAt = 3_000L),
            ),
        )
        engine.apply(since = null)
    }

    @Test
    fun aPatreonOnlyEpisodeIsKeptWithNoAudio() = runBlocking {
        patreonCatalogue()
        val early = db.episodeDao().episode("early")!!
        assertNull(early.audioUrl)
        assertEquals("4", early.patreonPostId)
    }

    @Test
    fun aShowIsSortedByItsNewestEpisodeOfAnyKindButOnlyPublicOnesMakeItNew() = runBlocking {
        patreonCatalogue()
        val show = db.showDao().all().single()
        assertEquals(6_000L, show.latestEpisodeAt)
        assertEquals(6_000L, show.latestPublicEpisodeAt)

        // An early release newer than anything public.
        catalogue.shows = ShowsResponse(4_000L, false, listOf(show("wsba", patreonShowId = "2073644")))
        catalogue.episodes["wsba"] = EpisodesResponse(
            5_000L, false, listOf(episode("later", publishedAt = 9_000L, public = false, patreonPostId = "5")),
        )
        engine.apply(since = 2_000L)

        val moved = db.showDao().all().single()
        assertEquals(9_000L, moved.latestEpisodeAt)
        assertEquals(6_000L, moved.latestPublicEpisodeAt)
    }

    @Test
    fun aPatronListsEpisodesWherePatreonPutThem() = runBlocking {
        patreonCatalogue()
        // Without a token: the public dates, which put both public episodes
        // after the early release.
        assertEquals(listOf("debrief1", "early", "e1", "e2"), db.episodeDao().forShow("wsba").map { it.guid })

        patreon.setToken("aTokenThatIsLongEnough")
        assertEquals(listOf("e1", "debrief1", "e2", "early"), db.episodeDao().forShow("wsba").map { it.guid })

        patreon.setToken(null)
        assertEquals(listOf("debrief1", "early", "e1", "e2"), db.episodeDao().forShow("wsba").map { it.guid })
    }

    @Test
    fun theNextEpisodeStepsOverPadlockedOnesWithoutAToken() = runBlocking {
        patreonCatalogue()
        assertEquals("e1", db.episodeDao().nextInShow("debrief1", hasToken = false)?.guid)

        patreon.setToken("aTokenThatIsLongEnough")
        assertEquals("debrief1", db.episodeDao().nextInShow("e1", hasToken = true)?.guid)
    }

    @Test
    fun padlockedEpisodesDontCountAsUnplayedWithoutAToken() = runBlocking {
        patreonCatalogue()
        assertEquals(2, db.showDao().observeShowsWithCounts(hasToken = false).first().single().unplayedCount)
        assertEquals(4, db.showDao().observeShowsWithCounts(hasToken = true).first().single().unplayedCount)
    }

    @Test
    fun aPatreonOnlyShowArrivesNotPublic() = runBlocking {
        catalogue.shows = ShowsResponse(2_000L, true, listOf(show("secret-fire", isPublic = false, patreonShowId = "2224146")))
        engine.apply(since = null)
        val show = db.showDao().all().single()
        assertFalse(show.isPublic)
        assertEquals("2224146", show.patreonShowId)
    }
}
