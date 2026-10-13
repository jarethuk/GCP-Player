package com.bencreswell.gcpplayer.ui.components

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.fromHtml
import com.bencreswell.gcpplayer.ui.theme.GcpColors

/**
 * A string from copy/strings.yaml that carries **bold** or [links](…).
 *
 * The generator writes those as HTML kept as literal text in copy.xml —
 * `getString` would otherwise strip the tags — and this turns it back into
 * styled text: bold as bold, links in the app's sky blue and tappable, opening
 * outside the app.
 */
@Composable
fun richStringResource(@StringRes id: Int): AnnotatedString =
    AnnotatedString.fromHtml(
        stringResource(id),
        linkStyles = TextLinkStyles(SpanStyle(color = GcpColors.Sky)),
    )
