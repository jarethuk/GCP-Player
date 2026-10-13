# GCP Player for Android

The Android sibling of [`../iOS`](../iOS). Same job, same design, same catalogue: the Glass
Cannon Network's shows split out of a combined RSS feed, played in order, held on device so a car
park with no signal doesn't stop playback.

The splitting happens in [`../api`](../api) now, not here. This app syncs a local copy of that
catalogue and then works entirely from it.

At feature parity with the iPhone and iPad app — shows, Patreon, offline downloads, the player,
the tablet layout, Android Auto — with the two gaps in section 10. What
follows is both the decision record for why it is built this way and the map of where things are.

---

## 1. Language and UI toolkit

**Kotlin + Jetpack Compose (Material 3).**

The iOS app is SwiftUI: state-driven views, an observable player object, `@Query`-style database
reads. Compose is the same shape of tool — `@Composable` functions over `StateFlow`, with
`ViewModel`s where SwiftUI has `@Observable` classes. The screens ported as *structure*, not as a
redesign, so the two apps stay recognisably the same product when one of them changes.

Material 3 is the base, but **dynamic colour (Material You) is off**. The point of this app is
that it wears the network's identity; letting Android repaint it from the user's wallpaper
defeats that.

### What this is not

| Option | Why not |
| --- | --- |
| **Kotlin Multiplatform** | The obvious pitch is sharing the title parser and feed sync. But the iOS app is Swift + SwiftData and would need rewriting to consume a KMP module, and the web app already has its own TypeScript copy. KMP pays off when you *start* two clients on it, not when you retrofit a third. Section 7 covers the drift problem far more cheaply. Revisit if a fourth client ever appears. |
| **Flutter / React Native** | Both clients would lose the thing that makes them good: CarPlay and Android Auto integration, background audio that behaves, and system media controls. The iOS app already exists and is native. |
| **A shared web view** | The web app exists and is a PWA. If a wrapper were enough, this folder wouldn't need to. |

---

## 2. Toolchain

| Tool | Version | Where |
| --- | --- | --- |
| Android Studio | installed | `~/Applications/Android Studio.app` |
| **JDK** | **Temurin 21.0.12 (LTS)** | `~/Library/Java/JavaVirtualMachines/jdk-21.0.12.1+1` |
| Gradle | 9.7.1 | via `./gradlew`; the Homebrew copy was only needed to generate the wrapper |
| AGP | 9.4.0 | which embeds Kotlin **2.2.10** — see the two notes below |
| SDK platform | `android-37.0` | `~/Library/Android/sdk` |
| build-tools | 36.0.0 | |
| platform-tools (adb) | 37.0.1 | |
| Emulator + image | API 37, Google Play, arm64 | verified on `emulator-5554` |

**Use JDK 21, not the JDK 25 bundled with Android Studio.** 21 is the current LTS and is what AGP
and Gradle are tested against; 25 is ahead of that support window. For a shell build:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=~/Library/Android/sdk
```

Studio has its own JDK setting (Settings ▸ Build ▸ Build Tools ▸ Gradle ▸ Gradle JDK) — point it
at the same 21.

> **AGP 9 compiles Kotlin itself.** The `org.jetbrains.kotlin.android` plugin is not merely
> unnecessary now — applying it fails the build outright:
> *"The 'org.jetbrains.kotlin.android' plugin is no longer required for Kotlin support since AGP
> 9.0."* So the root build file declares `com.android.application` and the Compose compiler
> plugin alone, and Kotlin sources live in `src/main/kotlin`. Most Android setup guides still
> tell you to add both plugins; they are out of date.

> **Three versions are pinned to AGP's Kotlin, not to their own latest.** AGP 9.4.0 embeds Kotlin
> 2.2.10 (read from its POM), and anything that has to speak to that compiler must be built
> against it: the **Compose compiler plugin** (2.2.10), **KSP** (2.2.10-2.0.2) and — less
> obviously — **Coil**, because 3.5+ ships class metadata version 2.4 that a 2.2.10 compiler
> refuses to read. Coil is held at **3.4.0**, the last release built with Kotlin 2.3.10. Lint
> will keep offering newer versions of all three; they move when AGP's compiler does, together.
>
> KSP also registers its generated sources through the `kotlin.sourceSets` DSL, which AGP 9's
> built-in Kotlin rejects — hence `android.disallowKotlinSourceSets=false` in
> `gradle.properties`, which is the escape hatch AGP's own error points at.

## 3. Targets

| Setting | Value | Reasoning |
| --- | --- | --- |
| `minSdk` | **26** (Android 8.0, 2017) | Comparable reach to the iOS app's iOS 17 floor (2018 hardware). 26 is also where notification channels and the modern foreground-service model start, both of which media playback needs. |
| `compileSdk` / `targetSdk` | **37** | The installed platform, and what the test emulator reports. |
| Form factor | **Phone and tablet**, plus Android Auto | The iPad's split layout at 700 dp wide and 480 dp tall — see section 11. |
| `applicationId` | **`com.bencreswell.gcpplayer`** | Reverse-DNS, as Play expects. The iOS bundle id is `bencreswell.gcpplayer`; they do not have to match and Play's convention wins here. |

---

## 4. Libraries, and what each replaces

Every choice here has a counterpart in the iOS app. Keeping the mapping explicit is what stops
the two drifting into different products.

| Concern | Android | iOS counterpart |
| --- | --- | --- |
| Playback | **Media3 ExoPlayer** | `AVPlayer` |
| System controls, lock screen, Bluetooth | **Media3 `MediaSession`** (via the service below) | `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` |
| **The car** | **Media3 `MediaLibraryService`** + `automotive_app_desc.xml` | `CarPlaySceneDelegate` + `CPListTemplate` |
| Downloads | **Media3 `DownloadManager` / `DownloadService`** | background `URLSession` |
| Database | **Room** | SwiftData |
| Preferences | **DataStore (Preferences)** | `UserDefaults` / `@AppStorage` |
| HTTP | **OkHttp** | `URLSession` |
| Catalogue JSON | **`org.json`** (platform) | `JSONDecoder` |
| Images | **Coil 3** | hand-rolled `ArtworkLoader` |
| DI | **Hilt** | singletons (`PlayerModel.shared`) |
| Launch screen | **`core-splashscreen`** | `UILaunchScreen` in Info.plist |

### Three places Android gave us something iOS had to hand-roll

1. **Downloads are a solved problem.** Media3's `DownloadManager` survives process death,
   resumes, retries, reports progress, and takes a `Requirements(NETWORK_UNMETERED)` — which *is*
   the "download over Wi-Fi only" setting, enforced by the system rather than by a flag on each
   request.
2. **"Play the local copy if we have it" is free.** A `CacheDataSource` over the download cache
   means ExoPlayer prefers downloaded bytes automatically. There is no equivalent of the iOS
   `localURL(for:) ?? streamURL` switch, and so no risk of the two getting out of step — which is
   the iOS version's one fragile seam.
3. **Download bookkeeping already exists.** Media3 keeps a `DownloadIndex` with state, progress
   and an `updateTimeMs`, so the Room schema has **no** `downloadFileName` / `downloadedAt`
   columns; the iOS app has those only because `URLSession` offered nothing. The one thing the
   index cannot express is *why* a download exists, so the "the user asked for this by hand, so
   the played/seven-day sweep must leave it alone" flag rides in the request's `data` blob.

### One place it cost us something

Media3's offline, session and library-service APIs are all `@UnstableApi`, and have been for
years; there is no stable alternative for building a downloading, car-aware player. The opt-in is
taken once, in `app/build.gradle.kts`, with `media3` pinned to an exact version — rather than
repeated as an annotation on every class that touches the player.

---

## 5. Structure

41 Kotlin files, ~6,500 lines, one module. Splitting `:core:data` / `:feature:*` would buy
build-time parallelism this app is far too small to need, and cost indirection immediately.

```
android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/libs.versions.toml          # one version catalogue, no scattered version strings
├── gradlew, gradle/wrapper/
└── app/
    ├── build.gradle.kts
    ├── schemas/                       # Room's exported schema, for future migrations
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── res/
        │   │   ├── font/               # archivoblack_regular, opensans_{regular,semibold,bold}
        │   │   ├── drawable-*/         # the d20 mark, the wordmark, adaptive icon layers
        │   │   ├── mipmap-anydpi/      # ic_launcher (adaptive + monochrome)
        │   │   ├── values/, values-v31/
        │   │   └── xml/automotive_app_desc.xml
        │   └── kotlin/com/bencreswell/gcpplayer/
        │       ├── GcpPlayerApp.kt            # @HiltAndroidApp; download channel
        │       ├── MainActivity.kt            # single activity, splash, edge-to-edge
        │       ├── di/AppModule.kt
        │       │
        │       ├── data/
        │       │   ├── db/                    # GcpDatabase, ShowDao, EpisodeDao
        │       │   ├── model/Entities.kt      # ShowEntity, EpisodeEntity, ShowWithCounts
        │       │   ├── api/
        │       │   │   ├── CatalogueDtos.kt   # the wire types, and org.json reading
        │       │   │   └── CatalogueApi.kt    # /shows and /shows/:slug/episodes
        │       │   ├── sync/
        │       │   │   └── SyncEngine.kt      # deltas, tombstones, local state
        │       │   ├── artwork/ArtworkUrls.kt # the imgix w=/h= rewrite
        │       │   ├── settings/SettingsStore.kt
        │       │   └── repo/LibraryRepository.kt
        │       │
        │       ├── playback/
        │       │   ├── PlaybackService.kt     # MediaLibraryService: session + car browse tree
        │       │   ├── PlayerController.kt    # what the UI talks to (a MediaController)
        │       │   ├── Downloads.kt           # the cache, the requirements, the sweep
        │       │   └── AudioDownloadService.kt
        │       │
        │       └── ui/
        │           ├── GcpApp.kt              # NavHost + the mini player over it
        │           ├── AppViewModel.kt
        │           ├── theme/                 # Color.kt, Type.kt, Theme.kt  (section 6)
        │           ├── components/            # MetaLabel, ScreenHeader, SegmentedPicker,
        │           │                          #   GradientPlayButton, SkipButton, NewChip,
        │           │                          #   Artwork, DownloadIndicator, actions menu
        │           ├── shows/, show/, episode/, nowplaying/, settings/
        └── androidTest/
            ├── assets/         # answers captured from a running API
            ├── CatalogueJsonTest.kt  # the wire format, against those
            ├── SyncEngineTest.kt     # delta rules, over in-memory Room
            └── BrowseTreeTest.kt     # the car's tree, over a real MediaBrowser
```

### Where the shapes differ from iOS, and why

- **The player is split in two.** iOS has one `PlayerModel`, because an iOS app is one process
  with one `AVPlayer`. Here the player lives in `PlaybackService` and the UI drives it through a
  `MediaController` in `PlayerController` — the same channel the notification and the car use, so
  there is exactly one player and no second copy of "what's playing" to keep in step. Everything
  that must happen with no screen open (saving the position, marking an episode played at the
  end, advancing through a show, queueing downloads) lives in the service.
- **Counts come from SQL.** The iOS shows list fakes an aggregate with a `fetchCount` per show,
  because SwiftData won't aggregate a relationship. Room will, so `observeShowsWithCounts()` is
  one query with a `LEFT JOIN` and a `GROUP BY`.
- **The sync engine reads, works on copies, and writes back.** SwiftData mutates live objects and
  saves the graph; Room doesn't. At ~2,000 episodes that is a few megabytes and one transaction,
  which beats a round trip per row.

---

## 6. Design system

The tokens exist three times now — [`../iOS/GCP Player/Theme.swift`](../iOS/GCP%20Player/Theme.swift),
the web app's `@theme` block, and `ui/theme/Color.kt`:

- **Colour**: ground `#03253F`, surface `#06304F`, sky `#7CC0DF`, bone `#EAF2F8`, muted `#9DB8CC`,
  ember `#E2483C` (semantic only — a show with a newly published episode).
- **The accent gradient**, at the network's own angle, as a Compose `Brush.linearGradient` with
  the same five stops. It marks the thing that plays and appears once per screen.
- **Type**: Archivo Black for display (always uppercase), Open Sans for everything else. The font
  files come from `../iOS/GCP Player/Fonts`, renamed to Android's lowercase resource convention.
- **Dark only.** `darkColorScheme` unconditionally; no light variant, no dynamic colour.

The tokens live in a `GcpColors` object rather than being forced through `MaterialTheme`'s slot
names, which do not map cleanly onto a brand palette. The colour scheme exists anyway, and its
`surfaceContainer*` roles are set, so Material's own widgets — switches, sliders, dropdown menus —
come up navy instead of near-black.

**Icon and launch screen.** Both use the network's real logo, cut from the same source art as the
iOS assets: an adaptive launcher icon (gradient background, d20 foreground, monochrome layer for
themed icons) and an Android 12+ splash with the mark centred and, from API 31, the wordmark as
the branding image. Fine for a pitch build; **not** fine for a public Play listing without the
network's written permission.

---

## 7. The title parser is gone from here

It used to live in three places: Swift (`../iOS`), TypeScript (`gcp/packages/shared/src/feed/`)
and Kotlin. Three copies of the same regexes drift — quietly, and in a way that surfaces as
episodes filed under the wrong show. The fix was not a shared fixture file, as this section used
to propose; it was moving the work behind [`../api`](../api), which parses the feeds once,
server-side, and serves the result. `TitleParser`, `FeedParser`, `FeedClient`, `FeedSources` and
`FeedSyncEngine` were all deleted, along with `TitleParserTest`.

What replaced them is `data/sync/SyncEngine.kt`, a port of `../iOS/GCP Player/SyncEngine.swift`,
under three rules that hold on both platforms:

1. **Local state is never touched.** Played, position, starred and the download bookkeeping belong
   to this device; the API has never heard of them. Only catalogue fields are written.
2. **Only what changed is asked for.** The API marks a show whenever its episodes change, so the
   shows a delta returns are exactly the shows worth looking inside. A launch with nothing new is
   one request — measured: `0 shows checked, +0 episodes`.
3. **A tombstone is a deletion.** A row carrying `deletedAt` is removed here, along with anything
   downloaded of it.

**Two cursors, deliberately.** The shows list has one, in DataStore, because the list is one
request. Each show carries its own `episodesSyncedAt` column, and it is written only after that
show's rows are committed — a cursor that advanced past data which failed to apply would skip it
for good. A show whose fetch failed keeps a null cursor and is retried on the next launch.

**An empty database ignores the cursor.** Otherwise a wiped local copy plus a live cursor asks for
"what changed since" a catalogue it no longer has, gets nothing, and stays empty for ever.

### Room migration, not a rebuild

Database version 2 drops `shows.matchPattern` — the regex that attributed episodes while the phone
was the thing parsing feeds — and adds `shows.episodesSyncedAt`. It is an `@AutoMigration` with a
`@DeleteColumn` spec rather than a destructive migration, because none of what is worth keeping
comes from the API: played, position and starred are all this device's, and would have been thrown
away silently on upgrade.

## 8. Decisions that are yours, not mine

1. ~~Local-only, or shared with the web backend?~~ ~~**Decided: local-only.**~~ **Superseded:**
   the catalogue now comes from [`../api`](../api), which landed exactly as this entry predicted —
   a sync layer over the same local store. Still no account and no sign-in screen; the app reads
   two public endpoints and keeps working with no network at all.
2. ~~`applicationId`~~ **Decided: `com.bencreswell.gcpplayer`.**
3. **A Play Console account** (one-off $25) — and note Android Auto apps go through a
   **driver-distraction review** before they can ship with car support enabled, the rough
   equivalent of Apple's CarPlay entitlement request. Start it early.
4. **The Glass Cannon branding conversation**, per section 6.
5. **A release signing key**, and whether to publish an App Bundle. The release build type is
   configured with R8 and resource shrinking but has never been signed or built for distribution.

---

## 9. What was verified, and how

Everything below was checked on `emulator-5554` (API 37), not assumed.

| | Result |
| --- | --- |
| Catalogue sync | **32 shows, 1,272 episodes** on a first run — the same list, in the same order, with the same counts the iOS app shows from the same API |
| Delta sync | a second launch with nothing new logs `0 shows checked, +0 episodes`: one request, no episode fetches |
| Wire format | 6 instrumented tests over answers captured from a running API (`androidTest/assets/*.json`) |
| Sync rules | 15 instrumented tests over in-memory Room: deltas, per-show cursors, retry of a show whose fetch failed, tombstones for a show and for an episode, `latestEpisodeAt` recomputed after a deletion, local state surviving an update, a full answer pruning what it omits — and Patreon: rows with no audio, the two latest dates, a patron's listing order, the next episode stepping over padlocks, and the unplayed count with and without a token |
| Patreon feeds | 3 instrumented tests: items keyed by the post id in `<link>` whatever their guid, and the token taken out of every link Patreon hands out |
| Patreon, end to end | against a local API: the upgrade from database 3 kept local state and fetched the Patreon catalogue; padlocks and the lock chip without a token; the token pasted and checked; a public episode streamed and downloaded from Patreon at its ad-free runtime (93 → 90 min); and that download played with Wi-Fi and data off |
| Tablet | the split view, the poster wall, the sidebar's selection, Play Next Unplayed in the hero, and the player as a dialog — on the phone emulator at 1600×2560, 320 dpi |
| Clear and resync | wiped and refetched from Settings: playback stopped, mini player gone, back arrow disabled during, and the list came back with correct counts |
| Playback | plays, pauses, seeks; survives backgrounding; media session registers with the system |
| Downloads | current + next queued on play; 204 MB on disk; progress ring tracks it |
| **Offline** | aeroplane mode, Wi-Fi off, force-stopped and relaunched: library intact, artwork intact, **episode played from the download cache** with no network error |
| End of episode | auto-advanced to the next episode in the show, marked the finished one played, reset its position, and removed its download — verified in both the Room and Media3 databases |
| Restore on launch | the mini player comes back with the last episode, paused, nothing buffered |
| Settings | all three default on; persisted to DataStore; Wi-Fi-only re-applied on every process start |
| Starring | My Shows / All Shows appear once something is starred |
| **Android Auto** | 2 instrumented tests drive a real `MediaBrowser` over the service: the root lists browsable shows, a show lists playable episodes carrying their show name |
| Player position | "1 OF 45" beside the download indicator, and the same string in `MediaMetadata.albumTitle` so the car's own now-playing template can show it |
| Lint | clean apart from four "a newer version exists" notices, all of them the deliberate toolchain pins in section 2 |

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.bencreswell.gcpplayer.data.sync.SyncEngineTest
./gradlew :app:connectedDebugAndroidTest  # all of them; BrowseTreeTest needs a synced library
./gradlew :app:lintDebug
./gradlew :app:installDebug
```

### Pointing a debug build at a local API

`API_BASE_URL` is a `buildConfigField`, defaulting to the deployed API. To develop against
`../api` running on the host, pass it as a property and forward the port:

```bash
./gradlew :app:installDebug -PapiBaseUrl=http://localhost:7331
adb reverse tcp:7331 tcp:7331
```

**Use `adb reverse`, not `10.0.2.2`.** The emulator's alias for the host resolves and is reachable
from an `adb shell` — `nc 10.0.2.2 7331` gets an answer — but the app's own connections to it
timed out every time. `adb reverse` forwards the device's own loopback to the host and works
immediately. The debug variant carries a `network_security_config.xml` permitting cleartext to
those two hosts only, which is this project's counterpart to the iOS app's `NSAllowsLocalNetworking`;
the release manifest never references it.

---

## 10. Not built

- **Voice search in the car** ("play Haunted City"). Would need a `MEDIA_PLAY_FROM_SEARCH`
  intent filter and `onSearch`/`onGetSearchResult` in the browse tree. The iOS app's CarPlay
  screen has no search either, so it is out of parity scope rather than forgotten — the manifest
  says so where lint asks about it.
- **Periodic background sync.** The app syncs on launch and on pull-to-refresh, exactly as the
  iOS app does. A WorkManager job would be a straightforward addition, and would be a *step past*
  parity rather than towards it.
- **Live sync between devices.** The iOS app carries played state, positions, stars and the
  Patreon link between a user's devices through their own iCloud account. Android has no private
  per-user store an app can reach without the user signing in to something — Google Drive's app
  data folder needs a Google sign-in and an OAuth client, and anything else needs accounts on the
  API. What this app does instead is take part in Android's own backup (`res/xml/*_rules.xml`):
  the library database and the preferences, never the audio, so a phone set up from this one's
  backup starts with the same history and Patreon already unlocked.
- **An Android TV app.** The iOS project now carries a tvOS target; its Android counterpart
  would be a Leanback / TV Compose app of its own, not a layout of this one.
- **A signed release build.** See section 8.

## 11. Patreon, and the tablet

A port of the iPhone app's Patreon support and its iPad layout; the root README describes both
as features. What is Android's own:

- **Every play and download asks [`EpisodeAudio`](app/src/main/kotlin/com/bencreswell/gcpplayer/playback/EpisodeAudio.kt)
  where to read from** — a finished download, Patreon, or the public feed — so the phone, the car
  and the auto-advance can't disagree. It is called from `onSetMediaItems`, which every start
  passes through. `setMediaItem`, which the phone's controller calls, arrives there with no start
  index at all: taken literally, nothing would be resolved and the item would play as the
  controller sent it. That also means the car's embedded artwork now reaches plays started on the
  phone, which it silently never did.
- **Patreon audio is cached under `patreon:<post id>`**, not its URL, which carries the token and
  a signature. Public episodes keep the URL as their key, so downloads made before Patreon still
  play from disk.
- **`listedAt` is a column**, rewritten in one `UPDATE` when the token changes and after every
  sync, because the listing order — the show's list, the next episode, "12 of 45", "mark previous
  as played" — is all SQL here. Database version 4 rebuilds the episodes table (`audioUrl`
  became nullable, which SQLite can't `ALTER`) and keeps every row's local state.
- **The tablet layout is chosen by the window**, at 700 dp wide *and* 480 dp tall, so a phone on
  its side keeps the phone's layout; `LocalIsWideLayout` carries the decision to the screens that
  change with it.
