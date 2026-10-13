package com.bencreswell.gcpplayer.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.bencreswell.gcpplayer.ui.components.youTubeLink
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/** The start time on a YouTube link. Instrumented because it leans on the platform's `Uri`. */
@RunWith(AndroidJUnit4::class)
class WatchOnYouTubeTest {

    @Test
    fun theStartTimeIsAddedInWholeSeconds() {
        assertEquals("https://youtu.be/eYkJB2rjUNo?t=754", youTubeLink("https://youtu.be/eYkJB2rjUNo", 754.9))
        assertEquals(
            "https://www.youtube.com/watch?v=eYkJB2rjUNo&t=754",
            youTubeLink("https://www.youtube.com/watch?v=eYkJB2rjUNo", 754.0),
        )
    }

    @Test
    fun aStartTimeAlreadyInTheLinkIsReplaced() {
        assertEquals("https://youtu.be/eYkJB2rjUNo?t=90", youTubeLink("https://youtu.be/eYkJB2rjUNo?t=12", 90.0))
        assertEquals(
            "https://www.youtube.com/live/eYkJB2rjUNo?si=abc&t=90",
            youTubeLink("https://www.youtube.com/live/eYkJB2rjUNo?si=abc&start=12", 90.0),
        )
    }

    @Test
    fun theFirstFewSecondsOpenAtTheStart() {
        assertEquals("https://youtu.be/eYkJB2rjUNo", youTubeLink("https://youtu.be/eYkJB2rjUNo", 3.0))
        assertEquals("https://youtu.be/eYkJB2rjUNo", youTubeLink("https://youtu.be/eYkJB2rjUNo?t=40", 0.0))
    }
}
