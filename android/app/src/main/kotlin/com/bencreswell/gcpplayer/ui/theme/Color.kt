package com.bencreswell.gcpplayer.ui.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The Glass Cannon Network's palette, read off glasscannonnetwork.com and
 * already carried by the iOS app (`iOS/GCP Player/Theme.swift`) and the web
 * app's `@theme` block. Same values, third language.
 */
object GcpColors {
    /** The network's page background. */
    val Ink = Color(0xFF03253F)
    /** Below the ground: bars, the player's chrome. */
    val InkDeep = Color(0xFF021A2E)
    /** Rows and cards, one step up from the ground. */
    val Surface = Color(0xFF06304F)
    val Sky = Color(0xFF7CC0DF)
    val Bone = Color(0xFFEAF2F8)
    /** Secondary text: a neutral biased toward the accent. */
    val Muted = Color(0xFF9DB8CC)
    /** Semantic only — a show with something newly published. Never decoration. */
    val Ember = Color(0xFFE2483C)
    /** Hairlines: the accent at low opacity, never grey. */
    val Line = Sky.copy(alpha = 0.16f)
}

/**
 * The site's button gradient, 118.64°. CSS angles are measured clockwise
 * from "to top", so the direction vector is (sin θ, −cos θ) and the
 * endpoints sit ±½ of it from the centre — the same arithmetic the iOS
 * `UnitPoint`s encode.
 *
 * Compose brushes take pixel offsets rather than unit points, so this is a
 * function of the size it is painted into. [accentGradient] below is the
 * ready-made version for callers that just want it to fill.
 */
fun accentGradientBrush(width: Float, height: Float): Brush = Brush.linearGradient(
    0.145f to Color(0xFF66C4EF),
    0.258f to Color(0xFF5DBBE7),
    0.435f to Color(0xFF47A2D2),
    0.661f to Color(0xFF237BB0),
    0.851f to Color(0xFF00548E),
    start = Offset(0.061f * width, 0.260f * height),
    end = Offset(0.939f * width, 0.740f * height),
)

/**
 * The accent gradient sized to whatever it is drawn into. Compose resolves
 * [Float.POSITIVE_INFINITY] to the drawing area's own edge, which is what
 * makes one shared brush usable at every size.
 */
val AccentGradient: Brush = Brush.linearGradient(
    0.145f to Color(0xFF66C4EF),
    0.258f to Color(0xFF5DBBE7),
    0.435f to Color(0xFF47A2D2),
    0.661f to Color(0xFF237BB0),
    0.851f to Color(0xFF00548E),
)

/** The site's section gradient, 115.55°. The app's page background. */
val GroundGradient: Brush = Brush.linearGradient(
    0.076f to Color(0xFF03253F),
    0.759f to Color(0xFF043559),
    start = Offset(0f, Float.POSITIVE_INFINITY),
    end = Offset(Float.POSITIVE_INFINITY, 0f),
)
