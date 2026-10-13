package com.bencreswell.gcpplayer.ui

import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.util.UnstableApi
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.bencreswell.gcpplayer.ui.episode.EpisodeScreen
import com.bencreswell.gcpplayer.ui.nowplaying.MiniPlayer
import com.bencreswell.gcpplayer.ui.nowplaying.NowPlayingScreen
import com.bencreswell.gcpplayer.ui.settings.SettingsScreen
import com.bencreswell.gcpplayer.ui.show.ShowScreen
import com.bencreswell.gcpplayer.ui.shows.ShowsScreen
import com.bencreswell.gcpplayer.ui.shows.ShowsViewModel
import com.bencreswell.gcpplayer.ui.theme.GcpColors
import com.bencreswell.gcpplayer.ui.wide.ShowsGrid
import com.bencreswell.gcpplayer.ui.wide.ShowsSidebar

private object Routes {
    const val SHOWS = "shows"
    const val GRID = "grid"
    const val SHOW = "show/{slug}"
    const val EPISODE = "episode/{guid}"
    const val SETTINGS = "settings"
    const val NOW_PLAYING = "nowPlaying"

    fun show(slug: String) = "show/$slug"
    fun episode(guid: String) = "episode/$guid"
}

/**
 * Where the app decides what shape it is — the iPad app's `ContentView`.
 *
 * **The window decides it, never the device.** A tablet in a narrow
 * multi-window pane gets the phone's layout exactly, and that is also what
 * keeps the phone from regressing while the tablet changes: the narrow case
 * *is* the old code path. A phone turned on its side is wide but short, and
 * keeps the phone's layout too — a sidebar beside 400 dp of height is two
 * cramped lists rather than one good one.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun GcpApp(viewModel: AppViewModel = hiltViewModel()) {
    // Activity-scoped, and shared by everything that shows the catalogue: on a
    // tablet the sidebar and the poster wall are both on screen, and a model
    // each would mean two syncs on every launch.
    val showsViewModel: ShowsViewModel = hiltViewModel()
    val focus = remember { FocusRequester() }
    var settingsRequested by remember { mutableIntStateOf(0) }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .focusRequester(focus)
            .focusable()
            // A hardware keyboard, on a tablet or a Chromebook: the same keys
            // as the iPad app. onKeyEvent rather than onPreviewKeyEvent, so a
            // focused text field gets a space before this does.
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                val command = event.isCtrlPressed || event.isMetaPressed
                when {
                    event.key == Key.Spacebar && !command -> viewModel.togglePlayPause()
                    event.key == Key.DirectionRight && event.isShiftPressed -> viewModel.playNext()
                    event.key == Key.DirectionRight -> viewModel.skip(30.0)
                    event.key == Key.DirectionLeft -> viewModel.skip(-15.0)
                    event.key == Key.R && command -> showsViewModel.refresh()
                    event.key == Key.Comma && command -> settingsRequested++
                    else -> return@onKeyEvent false
                }
                true
            }
    ) {
        LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
        val isWide = maxWidth >= WIDE_MIN_WIDTH && maxHeight >= WIDE_MIN_HEIGHT
        CompositionLocalProvider(LocalIsWideLayout provides isWide) {
            if (isWide) {
                WideApp(viewModel, showsViewModel, settingsRequested)
            } else {
                PhoneApp(viewModel, showsViewModel, settingsRequested)
            }
        }
    }
}

/**
 * The navigation stack, with the mini player over it.
 *
 * The bar *overlays* the screens rather than insetting them, so content
 * scrolls underneath it — and every screen is handed a bottom padding big
 * enough that its last row can still be scrolled clear.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun PhoneApp(viewModel: AppViewModel, showsViewModel: ShowsViewModel, settingsRequested: Int) {
    val navController = rememberNavController()
    val playback by viewModel.playback.collectAsStateWithLifecycle()

    val backStack by navController.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val showsMiniPlayer = playback.episode != null && route != Routes.NOW_PLAYING

    val systemTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val systemBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val contentPadding = PaddingValues(
        top = systemTop,
        bottom = systemBottom + if (showsMiniPlayer) MINI_PLAYER_HEIGHT else 0.dp,
    )

    LaunchedEffect(settingsRequested) {
        if (settingsRequested > 0 && route != Routes.SETTINGS) navController.navigate(Routes.SETTINGS)
    }

    Box(Modifier.fillMaxSize()) {
        NavHost(navController, startDestination = Routes.SHOWS) {
            composable(Routes.SHOWS) {
                ShowsScreen(
                    onOpenShow = { navController.navigate(Routes.show(it)) },
                    onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                    contentPadding = contentPadding,
                    viewModel = showsViewModel,
                )
            }
            detailDestinations(navController, viewModel, contentPadding)

            // Presented like the iOS sheet: it rises over the stack rather
            // than replacing it, and the show link underneath still works.
            composable(
                Routes.NOW_PLAYING,
                enterTransition = { slideInVertically { it } },
                exitTransition = { slideOutVertically { it } },
                popEnterTransition = { slideInVertically { it } },
                popExitTransition = { slideOutVertically { it } },
            ) {
                NowPlaying(viewModel) { slug ->
                    // Close the player first, then push: the stack is behind it.
                    navController.popBackStack()
                    navController.navigate(Routes.show(slug))
                }
            }
        }

        if (showsMiniPlayer) {
            MiniPlayer(
                state = playback,
                onTogglePlayPause = viewModel::togglePlayPause,
                onOpen = { navController.navigate(Routes.NOW_PLAYING) },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = systemBottom),
            )
        }
    }
}

/**
 * The tablet: the shows as a sidebar that is always there, and beside it a
 * stack one push deep instead of two — the iPad app's split view.
 *
 * The player is the phone's, deliberately: a mini bar across the full width
 * of the window, and the same full player over it, here as a centred dialog.
 * A column of its own beside the sidebar left the show itself too cramped.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun WideApp(viewModel: AppViewModel, showsViewModel: ShowsViewModel, settingsRequested: Int) {
    val detail = rememberNavController()
    val playback by viewModel.playback.collectAsStateWithLifecycle()
    var selectedSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var showsPlayer by rememberSaveable { mutableStateOf(false) }

    val systemTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val systemBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val showsMiniPlayer = playback.episode != null
    val contentPadding = PaddingValues(
        top = systemTop,
        bottom = systemBottom + if (showsMiniPlayer) MINI_PLAYER_HEIGHT else 0.dp,
    )

    // Changing the sidebar's selection starts the detail column over.
    // Without that you land on an episode that isn't in the list beside it.
    fun select(slug: String) {
        selectedSlug = slug
        detail.navigate(Routes.show(slug)) {
            popUpTo(Routes.GRID)
            launchSingleTop = true
        }
    }

    fun openSettings() {
        selectedSlug = null
        detail.navigate(Routes.SETTINGS) {
            popUpTo(Routes.GRID)
            launchSingleTop = true
        }
    }

    LaunchedEffect(settingsRequested) { if (settingsRequested > 0) openSettings() }

    // Back to the wall clears the selection, so the sidebar doesn't go on
    // claiming a show that is no longer on screen.
    val backStack by detail.currentBackStackEntryAsState()
    LaunchedEffect(backStack?.destination?.route) {
        if (backStack?.destination?.route == Routes.GRID) selectedSlug = null
    }

    Box(Modifier.fillMaxSize().background(GcpColors.Ink)) {
        Row(Modifier.fillMaxSize()) {
            ShowsSidebar(
                viewModel = showsViewModel,
                selectedSlug = selectedSlug,
                onSelect = ::select,
                onOpenSettings = ::openSettings,
                contentPadding = contentPadding,
                modifier = Modifier.width(SIDEBAR_WIDTH).fillMaxHeight(),
            )
            VerticalDivider(color = GcpColors.Line)
            Box(Modifier.weight(1f).fillMaxHeight()) {
                NavHost(detail, startDestination = Routes.GRID) {
                    composable(Routes.GRID) {
                        ShowsGrid(showsViewModel, onOpenShow = ::select, contentPadding = contentPadding)
                    }
                    detailDestinations(detail, viewModel, contentPadding)
                }
            }
        }

        if (showsMiniPlayer) {
            MiniPlayer(
                state = playback,
                onTogglePlayPause = viewModel::togglePlayPause,
                onOpen = { showsPlayer = true },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = systemBottom),
            )
        }
    }

    if (showsPlayer) {
        Dialog(
            onDismissRequest = { showsPlayer = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(Modifier.size(width = 460.dp, height = 780.dp).clip(RoundedCornerShape(20.dp))) {
                NowPlaying(viewModel) { slug ->
                    showsPlayer = false
                    select(slug)
                }
            }
        }
    }
}

/** A show, an episode and Settings: the same on a phone's stack and a tablet's detail column. */
@androidx.annotation.OptIn(UnstableApi::class)
private fun androidx.navigation.NavGraphBuilder.detailDestinations(
    navController: NavHostController,
    viewModel: AppViewModel,
    contentPadding: PaddingValues,
) {
    composable(
        Routes.SHOW,
        arguments = listOf(navArgument("slug") { type = NavType.StringType }),
    ) {
        ShowScreen(
            onBack = { navController.popBackStack() },
            onOpenEpisode = { navController.navigate(Routes.episode(it)) },
            contentPadding = contentPadding,
        )
    }

    composable(
        Routes.EPISODE,
        arguments = listOf(navArgument("guid") { type = NavType.StringType }),
    ) {
        val playback by viewModel.playback.collectAsStateWithLifecycle()
        EpisodeScreen(
            playback = playback,
            onBack = { navController.popBackStack() },
            contentPadding = contentPadding,
        )
    }

    composable(Routes.SETTINGS) {
        SettingsScreen(
            onBack = { navController.popBackStack() },
            contentPadding = contentPadding,
        )
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun NowPlaying(viewModel: AppViewModel, onGoToShow: (String) -> Unit) {
    val playback by viewModel.playback.collectAsStateWithLifecycle()
    val scrubSeconds by viewModel.scrubSeconds.collectAsStateWithLifecycle()
    val statuses by viewModel.downloadStatuses.collectAsStateWithLifecycle()
    val hasNext by viewModel.hasNext.collectAsStateWithLifecycle()
    NowPlayingScreen(
        state = playback,
        scrubSeconds = scrubSeconds,
        downloadStatus = playback.episode?.let { statuses[it.guid] },
        hasNext = hasNext,
        onTogglePlayPause = viewModel::togglePlayPause,
        onSkip = viewModel::skip,
        onScrub = viewModel::scrub,
        onSeek = viewModel::seek,
        onPlayNext = viewModel::playNext,
        onGoToShow = onGoToShow,
    )
}

/**
 * Whether the window has the tablet's split layout — the iPad app's regular
 * size class. For the things that belong to the layout as a whole rather than
 * to how wide one pane happens to be.
 */
val LocalIsWideLayout = staticCompositionLocalOf { false }

private val MINI_PLAYER_HEIGHT = 64.dp

/** Wide enough for a 320 dp sidebar and a show beside it that isn't a phone's width. */
private val WIDE_MIN_WIDTH = 700.dp

/** And tall enough that two columns of list are worth having. */
private val WIDE_MIN_HEIGHT = 480.dp

private val SIDEBAR_WIDTH = 320.dp
