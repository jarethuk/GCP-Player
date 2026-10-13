package com.bencreswell.gcpplayer.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * Dark only, and never dynamic colour.
 *
 * The point of this app is that it wears the network's identity; letting
 * Android repaint it from the user's wallpaper defeats that, and a light
 * variant would strand the navy that carries the identity.
 *
 * Material's slot names don't map cleanly onto a brand palette — arguing
 * about what "primary" means is how a design system gets diluted — so the
 * colour scheme below only exists to keep Material's own widgets (ripples,
 * switches, sliders) in the right family. Everything the app draws itself
 * reads [GcpColors] directly.
 */
@Composable
fun GcpTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = GcpColors.Sky,
            onPrimary = GcpColors.InkDeep,
            secondary = GcpColors.Sky,
            background = GcpColors.Ink,
            onBackground = GcpColors.Bone,
            surface = GcpColors.Surface,
            onSurface = GcpColors.Bone,
            surfaceVariant = GcpColors.Surface,
            onSurfaceVariant = GcpColors.Muted,
            // Menus and sheets pull their background from the container
            // roles; left at Material's defaults they come up near-black
            // against the navy.
            surfaceContainer = GcpColors.Surface,
            surfaceContainerHigh = GcpColors.Surface,
            surfaceContainerHighest = GcpColors.Surface,
            surfaceContainerLow = GcpColors.Ink,
            surfaceContainerLowest = GcpColors.InkDeep,
            error = GcpColors.Ember,
        ),
        typography = Typography(
            bodyLarge = GcpType.body(14f),
            bodyMedium = GcpType.body(13f),
            labelLarge = GcpType.bold(11f),
        ),
        content = content,
    )
}
