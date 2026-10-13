package com.bencreswell.gcpplayer.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.bencreswell.gcpplayer.R

/**
 * Open Sans is the network's body face. Their display face is Babell, which
 * isn't licensed for this, so Archivo Black stands in — the same
 * substitution the iOS app makes, from the same font files.
 */
val OpenSans = FontFamily(
    Font(R.font.opensans_regular, FontWeight.Normal),
    Font(R.font.opensans_semibold, FontWeight.SemiBold),
    Font(R.font.opensans_bold, FontWeight.Bold),
)

val ArchivoBlack = FontFamily(Font(R.font.archivoblack_regular, FontWeight.Black))

object GcpType {
    /**
     * Show and screen titles. Always set uppercase at the call site — the
     * face is a display weight and reads as shouting by design.
     */
    fun display(size: Float) = TextStyle(
        fontFamily = ArchivoBlack,
        fontWeight = FontWeight.Black,
        fontSize = size.sp,
    )

    fun body(size: Float) = TextStyle(fontFamily = OpenSans, fontSize = size.sp)

    fun semibold(size: Float) =
        TextStyle(fontFamily = OpenSans, fontWeight = FontWeight.SemiBold, fontSize = size.sp)

    fun bold(size: Float) =
        TextStyle(fontFamily = OpenSans, fontWeight = FontWeight.Bold, fontSize = size.sp)

    /**
     * The site's metadata treatment: bold uppercase, widely tracked.
     * 2.1px of tracking at 14px on the site, scaled to fit here.
     */
    fun meta(size: Float = 9.5f, tracking: Float = 1.4f) = TextStyle(
        fontFamily = OpenSans,
        fontWeight = FontWeight.Bold,
        fontSize = size.sp,
        letterSpacing = tracking.sp,
    )
}
