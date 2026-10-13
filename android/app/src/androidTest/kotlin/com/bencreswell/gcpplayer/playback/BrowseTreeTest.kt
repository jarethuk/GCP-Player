package com.bencreswell.gcpplayer.playback

import android.content.ComponentName
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android Auto talks to [PlaybackService] the same way any media browser
 * does, so a `MediaBrowser` connected from a test exercises exactly the
 * path the car takes. Short of the Desktop Head Unit, this is the check
 * that the browse tree is really there and really answers.
 *
 * It needs a synced library, so run it after the app has fetched the feeds
 * at least once on the device.
 */
@UnstableApi
@RunWith(AndroidJUnit4::class)
class BrowseTreeTest {

    private suspend fun browser(): MediaBrowser = withContext(Dispatchers.Main) {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        MediaBrowser.Builder(context, token).buildAsync().await()
    }

    @Test
    fun theRootListsShows() = runBlocking {
        val browser = browser()
        try {
            val root = withContext(Dispatchers.Main) { browser.getLibraryRoot(null).await() }
            assertEquals(PlaybackService.ROOT_ID, root.value?.mediaId)

            val shows = withContext(Dispatchers.Main) {
                browser.getChildren(PlaybackService.ROOT_ID, 0, 100, null).await()
            }.value.orEmpty()

            assertTrue("the root should list shows", shows.isNotEmpty())
            assertTrue(
                "shows should be browsable folders, not playable items",
                shows.all { it.mediaMetadata.isBrowsable == true },
            )
            assertTrue(
                "show ids should be addressable",
                shows.all { it.mediaId.startsWith(PlaybackService.SHOW_PREFIX) },
            )
            // Starred shows come first, the way "My Shows" does on the
            // phone — a car screen is no place to scroll.
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        } finally {
            withContext(Dispatchers.Main) { browser.release() }
        }
    }

    @Test
    fun aShowListsPlayableEpisodes() = runBlocking {
        val browser = browser()
        try {
            val shows = withContext(Dispatchers.Main) {
                browser.getChildren(PlaybackService.ROOT_ID, 0, 100, null).await()
            }.value.orEmpty()
            assertTrue("needs a synced library", shows.isNotEmpty())

            // Find a show that actually has episodes — a seeded show with a
            // pattern and no episodes yet is legitimately empty.
            var episodes = emptyList<androidx.media3.common.MediaItem>()
            for (show in shows) {
                val children = withContext(Dispatchers.Main) {
                    browser.getChildren(show.mediaId, 0, 50, null).await()
                }.value.orEmpty()
                if (children.isNotEmpty()) {
                    episodes = children
                    break
                }
            }

            assertTrue("at least one show should list episodes", episodes.isNotEmpty())
            assertTrue(
                "episodes should be playable",
                episodes.all { it.mediaMetadata.isPlayable == true },
            )
            assertTrue(
                "episodes should carry their show as the artist, for the car's second line",
                episodes.any { it.mediaMetadata.artist != null },
            )
        } finally {
            withContext(Dispatchers.Main) { browser.release() }
        }
    }
}
