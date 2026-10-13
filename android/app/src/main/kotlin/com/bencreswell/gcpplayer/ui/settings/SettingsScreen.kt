package com.bencreswell.gcpplayer.ui.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Verified
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import com.bencreswell.gcpplayer.R
import com.bencreswell.gcpplayer.ui.components.MetaLabel
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.compose.foundation.clickable
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bencreswell.gcpplayer.ui.components.CircleIconButton
import com.bencreswell.gcpplayer.ui.components.ScreenHeader
import com.bencreswell.gcpplayer.ui.components.richStringResource
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.theme.GcpType
import com.bencreswell.gcpplayer.ui.theme.GroundGradient

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    contentPadding: PaddingValues,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val isResetting by viewModel.isResetting.collectAsStateWithLifecycle()
    val resetError by viewModel.resetError.collectAsStateWithLifecycle()

    var menuOpen by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(GroundGradient)
            .padding(contentPadding)
            .verticalScroll(rememberScrollState()),
    ) {
        // Back on the left, overflow on the right, both in the same round
        // treatment the Shows screen uses for its gear.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircleIconButton(
                Icons.AutoMirrored.Filled.ArrowBack,
                stringResource(R.string.common_back),
                // Going back mid-reset would leave the wipe running against a
                // screen that is no longer there to report it failing.
                modifier = if (isResetting) Modifier else Modifier.clickable(onClick = onBack),
                tint = if (isResetting) GcpColors.Muted else GcpColors.Sky,
            )
            Box {
                CircleIconButton(
                    Icons.Filled.MoreVert,
                    stringResource(R.string.common_more),
                    modifier = Modifier.clickable { menuOpen = true },
                )
                DropdownMenu(
                    expanded = menuOpen,
                    onDismissRequest = { menuOpen = false },
                    containerColor = GcpColors.Surface,
                ) {
                    DropdownMenuItem(
                        text = {
                            Text(
                                stringResource(R.string.settings_clear_data),
                                style = GcpType.semibold(14f),
                                color = GcpColors.Ember,
                            )
                        },
                        onClick = {
                            menuOpen = false
                            confirming = true
                        },
                    )
                }
            }
        }

        ScreenHeader(
            stringResource(R.string.settings_eyebrow),
            stringResource(R.string.settings_title),
            Modifier.padding(horizontal = 16.dp).padding(bottom = 20.dp),
            titleSize = 30f,
        )

        Column(
            Modifier.padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SettingRow(
                title = stringResource(R.string.settings_wifi_only_title),
                detail = stringResource(R.string.settings_wifi_only_detail),
                isOn = settings.wifiOnly,
                onChange = viewModel::setWifiOnly,
            )
            SettingRow(
                title = stringResource(R.string.settings_current_episode_title),
                detail = stringResource(R.string.settings_current_episode_detail),
                isOn = settings.downloadsCurrentEpisode,
                onChange = viewModel::setDownloadsCurrentEpisode,
            )
            SettingRow(
                title = stringResource(R.string.settings_next_episode_title),
                detail = stringResource(R.string.settings_next_episode_detail),
                isOn = settings.downloadsNextEpisode,
                onChange = viewModel::setDownloadsNextEpisode,
            )
        }

        Text(
            stringResource(R.string.settings_downloads_note),
            style = GcpType.body(12f),
            color = GcpColors.Muted,
            modifier = Modifier.padding(horizontal = 18.dp).padding(top = 18.dp),
        )

        PatreonSection(
            viewModel,
            Modifier.padding(horizontal = 12.dp).padding(top = 26.dp, bottom = 28.dp),
        )
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            containerColor = GcpColors.Surface,
            title = {
                Text(stringResource(R.string.settings_clear_data_confirm_title), style = GcpType.semibold(16f), color = GcpColors.Bone)
            },
            text = {
                Text(
                    stringResource(R.string.settings_clear_data_message),
                    style = GcpType.body(12.5f),
                    color = GcpColors.Muted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirming = false
                    viewModel.clearAndResync()
                }) {
                    Text(stringResource(R.string.settings_clear_data_confirm), style = GcpType.semibold(14f), color = GcpColors.Ember)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) {
                    Text(stringResource(R.string.common_cancel), style = GcpType.semibold(14f), color = GcpColors.Sky)
                }
            },
        )
    }

    if (isResetting) {
        // Over everything, and swallowing taps: the rows underneath are backed
        // by tables that are being emptied.
        Box(
            Modifier
                .fillMaxSize()
                .background(GcpColors.Ink.copy(alpha = 0.82f))
                .clickable(enabled = true, onClick = {}),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = GcpColors.Sky)
                Spacer(Modifier.height(14.dp))
                Text(
                    stringResource(R.string.settings_clearing).uppercase(),
                    style = GcpType.meta(),
                    color = GcpColors.Muted,
                )
            }
        }
    }

    resetError?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissResetError,
            containerColor = GcpColors.Surface,
            title = {
                Text(stringResource(R.string.settings_clear_data_failed_title), style = GcpType.semibold(16f), color = GcpColors.Bone)
            },
            text = {
                val note = stringResource(R.string.settings_clear_data_failed_note)
                Text("$message\n\n$note", style = GcpType.body(12.5f), color = GcpColors.Muted)
            },
            confirmButton = {
                TextButton(onClick = viewModel::dismissResetError) {
                    Text(stringResource(R.string.common_ok), style = GcpType.semibold(14f), color = GcpColors.Sky)
                }
            },
        )
    }
}

/**
 * The Patreon feed link: pasted once, reduced to its token and kept in the
 * database. See PatreonAccount.
 */
@Composable
private fun PatreonSection(viewModel: SettingsViewModel, modifier: Modifier = Modifier) {
    val hasToken by viewModel.hasPatreonToken.collectAsStateWithLifecycle()
    val isChecking by viewModel.isCheckingPatreon.collectAsStateWithLifecycle()
    val error by viewModel.patreonError.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current
    var link by remember { mutableStateOf("") }
    var confirmingRemoval by remember { mutableStateOf(false) }

    Column(modifier) {
        MetaLabel(stringResource(R.string.patreon_label), showsTick = false, color = GcpColors.Sky, modifier = Modifier.padding(horizontal = 6.dp))
        Spacer(Modifier.height(10.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(GcpColors.Surface)
                .border(1.dp, GcpColors.Line, RoundedCornerShape(10.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (hasToken) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Filled.Verified, contentDescription = null, tint = GcpColors.Sky, modifier = Modifier.size(20.dp))
                    Text(stringResource(R.string.patreon_connected), style = GcpType.semibold(14f), color = GcpColors.Bone)
                }
                Text(
                    stringResource(R.string.patreon_connected_detail),
                    style = GcpType.body(11.5f),
                    color = GcpColors.Muted,
                )
                Text(
                    stringResource(R.string.patreon_remove_link),
                    style = GcpType.semibold(13f),
                    color = GcpColors.Ember,
                    modifier = Modifier.clickable { confirmingRemoval = true },
                )
            } else {
                Text(
                    stringResource(R.string.patreon_intro),
                    style = GcpType.body(11.5f),
                    color = GcpColors.Muted,
                )
                PatreonLinkSteps()
                OutlinedTextField(
                    value = link,
                    onValueChange = { link = it },
                    placeholder = {
                        Text("https://www.patreon.com/rss/…", style = GcpType.body(13f), color = GcpColors.Muted.copy(alpha = 0.6f))
                    },
                    textStyle = GcpType.body(13f).copy(color = GcpColors.Bone),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { viewModel.savePatreonLink(link) { link = "" } }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GcpColors.Sky,
                        unfocusedBorderColor = GcpColors.Line,
                        cursorColor = GcpColors.Sky,
                        focusedContainerColor = GcpColors.Ink,
                        unfocusedContainerColor = GcpColors.Ink,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, style = GcpType.body(11.5f), color = GcpColors.Ember) }
                // Side by side at Material's standard button height, the same
                // width and shape, and an icon beside each label — the same
                // control twice, one outlined and one filled.
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(
                        onClick = {
                            // Android shows its own "pasted from" notice; there
                            // is no prompt to get past.
                            clipboard.getText()?.text?.let { pasted ->
                                link = pasted
                                viewModel.savePatreonLink(pasted) { link = "" }
                            }
                        },
                        enabled = !isChecking,
                        border = BorderStroke(1.dp, GcpColors.Sky.copy(alpha = if (isChecking) 0.3f else 0.6f)),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Filled.ContentPaste, contentDescription = null, tint = GcpColors.Sky, modifier = Modifier.size(ButtonDefaults.IconSize))
                        Spacer(Modifier.width(ButtonDefaults.IconSpacing))
                        Text(stringResource(R.string.common_paste), style = GcpType.semibold(14f), color = GcpColors.Sky)
                    }
                    Button(
                        onClick = { viewModel.savePatreonLink(link) { link = "" } },
                        enabled = link.isNotBlank() && !isChecking,
                        colors = ButtonDefaults.buttonColors(containerColor = GcpColors.Sky, contentColor = GcpColors.InkDeep),
                        modifier = Modifier.weight(1f),
                    ) {
                        if (isChecking) {
                            CircularProgressIndicator(color = GcpColors.InkDeep, strokeWidth = 2.dp, modifier = Modifier.size(ButtonDefaults.IconSize))
                        } else {
                            Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                        }
                        Spacer(Modifier.width(ButtonDefaults.IconSpacing))
                        Text(stringResource(if (isChecking) R.string.common_checking else R.string.common_save), style = GcpType.semibold(14f))
                    }
                }
            }
        }
    }

    if (confirmingRemoval) {
        AlertDialog(
            onDismissRequest = { confirmingRemoval = false },
            containerColor = GcpColors.Surface,
            title = { Text(stringResource(R.string.patreon_remove_confirm_title), style = GcpType.semibold(16f), color = GcpColors.Bone) },
            text = {
                Text(
                    stringResource(R.string.patreon_remove_confirm_message),
                    style = GcpType.body(12.5f),
                    color = GcpColors.Muted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingRemoval = false
                    viewModel.removePatreonLink()
                }) {
                    Text(stringResource(R.string.common_remove), style = GcpType.semibold(14f), color = GcpColors.Ember)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingRemoval = false }) {
                    Text(stringResource(R.string.common_cancel), style = GcpType.semibold(14f), color = GcpColors.Sky)
                }
            },
        )
    }
}

/**
 * Where the RSS link is on Patreon. It is several taps deep, and nothing on
 * Patreon's side calls it what this screen does, so the steps are spelled out
 * with the button names exactly as Patreon shows them.
 *
 * The links open outside the app — in the Patreon app where it's installed,
 * the browser otherwise — since signing in to Patreon is not something to do
 * inside someone else's app.
 */
@Composable
private fun PatreonLinkSteps() {
    val steps = listOf(
        richStringResource(R.string.patreon_step_login),
        richStringResource(R.string.patreon_step_open_show),
        richStringResource(R.string.patreon_step_listen),
        richStringResource(R.string.patreon_step_other_apps),
        richStringResource(R.string.patreon_step_copy),
        richStringResource(R.string.patreon_step_paste),
    )

    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        steps.forEachIndexed { index, step ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "${index + 1}",
                    style = GcpType.bold(11f),
                    color = GcpColors.Sky,
                    textAlign = TextAlign.End,
                    modifier = Modifier.width(14.dp).alignByBaseline(),
                )
                Text(step, style = GcpType.body(12.5f), color = GcpColors.Bone, modifier = Modifier.alignByBaseline())
            }
        }
    }
}

/** One preference: what it does on the left, the switch on the right. */
@Composable
private fun SettingRow(
    title: String,
    detail: String,
    isOn: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(GcpColors.Surface)
            .border(1.dp, GcpColors.Line, RoundedCornerShape(10.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = GcpType.semibold(14f), color = GcpColors.Bone)
            Spacer(Modifier.height(4.dp))
            Text(detail, style = GcpType.body(11.5f), color = GcpColors.Muted)
        }
        Switch(
            checked = isOn,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = GcpColors.InkDeep,
                checkedTrackColor = GcpColors.Sky,
                uncheckedThumbColor = GcpColors.Muted,
                uncheckedTrackColor = GcpColors.Surface,
                uncheckedBorderColor = GcpColors.Line,
            ),
        )
    }
}
