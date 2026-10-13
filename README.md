# GCP Player

The Glass Cannon Network publishes every show into one RSS feed, oldest to newest. A normal
podcast app therefore interleaves four unrelated actual-play campaigns and makes you scroll
hundreds of episodes to find your place. This app splits that feed back into separate shows, in
listening order, and keeps the next few episodes on the device so playback survives a tunnel.

| Folder | What |
| --- | --- |
| [`iOS/`](iOS) | The iPhone and iPad app. Swift, SwiftUI, SwiftData, CarPlay. Built, and on TestFlight. |
| [`android/`](android) | The Android app. Kotlin, Compose, Room, Media3, Android Auto. At feature parity — see [`android/README.md`](android/README.md). |
| [`api/`](api) | The catalogue API. Hono on Vercel, Postgres on Neon, Prisma. Ingests the nine feeds and serves them as deltas — see [`api/README.md`](api/README.md). |
| [`web/`](web) | The web app: the iPhone layout on a phone, the iPad's on anything wider. React, Vite, Tailwind, IndexedDB; downloads while it's open — see [`web/README.md`](web/README.md). |
| [`dashboard/`](dashboard) | Where the catalogue gets fixed by hand. React, Vite, Storybook, drawn with the web app's components — see [`dashboard/README.md`](dashboard/README.md). |
| [`web-components/`](web-components) | The theme and components the web app and the dashboard share — see [`web-components/README.md`](web-components/README.md). |
| [`copy/`](copy) | Every piece of user-facing text in the iOS, tvOS, Android and web apps, in one file every build generates its strings from — see [`copy/README.md`](copy/README.md). |

The web app in [`web/`](web) syncs from the same API and ports the same rules, but downloads only
while it's open and, with no account yet, keeps what you've played in the browser. (An older web
version in its own repository, `gcp`, is unrelated to this code.)

The two phone apps are the same product twice, not one product and its port. They sync from the
same API, hold the same things offline, and wear the same design. The next three sections
describe both; where they differ, they say so.

**Both apps sync from the API**, and neither reads a feed any more. Each still keeps a full local
copy and works with no signal at all — that is most of the point, and moving the parsing to the
server didn't change it.

---

## Where the episodes come from

Nine public RSS feeds, the set the network lists in its [subscription
FAQ](https://www.glasscannonnetwork.com/faq): the main Megaphone feed that carries most of the
network, plus eight per-show feeds on Acast and Anchor. The API's ingest fetches them
concurrently on its daily run; a feed that fails is reported, not fatal. (Side Quest Side Sesh
currently 404s, and has since the app was written — its episodes come through the main feed
anyway.) The phones never see any of this: they ask the API what changed.

Three things about that feed set are load-bearing, and the API handles all three in
[`plan.ts`](api/src/feed/plan.ts):

- **Episodes carry their show in the title, not in the feed.** The main feed's items look like
  `Shaggy's Fight | Blood of the Wild S1 E38 | Pathfinder 2E`, so the
  [title parser](api/src/feed/parse-title.ts) splits episode, show, numbering and game system out
  of the string. Shows that never use that format (Cannon Fodder, GCN News Minute, Strange
  Aeons…) are claimed by per-show regex instead.
- **The per-show feeds don't all use that format.** `Wicked Empire S1 | E10 - The Temple` and
  `Androids & Aliens 155 - …` need a different read, so a feed that carries exactly one show says
  so up front and the parser only has to recover the numbering.
- **The network cross-posts.** All 45 Haunted City episodes appear in both the main feed and
  Haunted City's own, under different guids and often different publish dates — so guid alone
  cannot spot the repeat. Episodes are de-duplicated on show + cleaned title, and the main feed's
  copy wins.

Episodes that can't be attributed to any show are kept with no show rather than dropped, so a
feed format change surfaces as a number in the sync result instead of episodes quietly vanishing.

A full sync currently yields **1,279 episodes across 32 shows**, with 45 cross-posts skipped and
9 episodes unattributed. Those numbers used to be a cross-check between two implementations of
the same parser; there is only one now, so they are a regression test instead. A feed format
change moves them, and nothing else should.

## What it does

**Shows** — every show, most recently published first, which is what `latestEpisodeAt` on the
show is for. A red rail and a NEW chip mark a show that has published in the last five days and
has something unheard; everything else carries its cover, its name and the game system, and no
numbers at all. (Both apps used to count unheard episodes beside every row and total the rest —
two numbers nobody was reading, on a back catalogue where almost every show has something
unplayed.) Starring a show adds a My Shows / All Shows switch. Playing an episode stars its show if it isn't already — following a
show is what listening to it means, so the list sorts itself without being told.

**A show** — full-bleed hero artwork with the title over a scrim, an Unplayed / Played filter, and
episodes oldest-first, which is the order you'd listen to a campaign in. Each row carries a
season/episode chip, the date, the runtime and an offline indicator. Most of the network's shows
publish no episode numbers at all, so the API derives them from release order — the chip is the
same size either way, so a list never mixes two box heights.

**Playing** — a mini player docked above every screen, and a full Now Playing screen with a
scrubber, 15/30-second skips, "play next episode" and a link back to the show. The last episode
played is restored on launch, paused at its saved position, without downloading anything.

**Watching** — about half the catalogue was filmed, and those episodes carry a Watch on YouTube
button that hands over to YouTube's own app, starting the video where you had got to in the audio
(`t=` on the link). Close rather than exact: a public episode's audio has ads the video doesn't,
so it runs a little ahead; Patreon's ad-free copy lines up far better.

**Offline** — this is most of the point:

- Playing an episode streams it immediately *and* downloads it in the background, then queues the
  show's next episode. Once a file is on disk it is played instead of the stream.
- Downloads can also be requested by hand from an episode's menu, which — unlike the automatic
  ones — will keep an episode you've already heard.
- They're removed once you've heard them, or after seven days.
- Downloads run in the background: a background `URLSession` on iOS, a Media3 `DownloadService`
  on Android. Both continue while the app is suspended or killed.
- Artwork is downsampled and kept permanently, and prefetched for anything downloaded, so an
  offline episode still has its cover on the player and the lock screen.

**Across your devices** — on iOS, what you've played, where you had got to, your starred shows
and your Patreon link follow your iCloud account, so a second iPhone, or the same one after a
restore, doesn't start from nothing. There is no account to make and nothing to switch on. The
catalogue isn't part of it — every device gets that from the API — and downloads aren't either,
because the audio can't cross. See [How progress syncs](#how-progress-syncs).

Android has no live equivalent, and this is the one place the two apps are not the same product
twice: Google offers no private per-user store an app can reach without the user signing in to
something. What it does have is Android's own backup, and the app now takes part in it — the
same state, Patreon link included, comes back on a phone set up from this one's backup. The audio
is excluded, which matters more than it sounds: Auto Backup gives up entirely past 25 MB, so
before the rules existed no backup of this app ever succeeded.

**Patreon** — some shows exist only on the network's Patreon, and patrons get the
public ones early. Those episodes are always listed; without a Patreon feed link they wear a
padlock and don't play. Shows are ordered by their newest episode either way, but without a link
only a public episode can make a show NEW — a show whose news is Patreon's wears a padlock where
the chip would be, and a Patreon-only show always does. Paste your Patreon RSS link into Settings
and they unlock: the app asks your own feed for the audio as you play or download, plays
Patreon's ad-free copy of public episodes too — with its own, shorter runtime — and lists every
episode by the date Patreon published it, so an early release sits where it came out rather
than months later. Only the token is kept, in the local database — on iOS it follows your iCloud
account to your other devices as an encrypted field, on Android it travels in the device backup.
The API never sees it. See [`Patreon.swift`](iOS/GCP%20Player/Patreon.swift) and
[`data/patreon/`](android/app/src/main/kotlin/com/bencreswell/gcpplayer/data/patreon).

A patron's feed item is found by the Patreon post id at the end of its `<link>`, not by its
`<guid>`: the back catalogue was imported from Supercast and kept Supercast's guids, which is
178 of Blood of the Wild's 203 posts.

**On a tablet** — the iPad's split layout on both: the shows as a sidebar with My Shows and All
Shows as sections, a poster wall of every cover until one is picked, the show one push deep
beside them, and the player as a full-width bar that opens a centred dialog. The window decides
it, never the device, so a tablet in a narrow pane — and a phone on its side — get the phone's
layout. Space, ←/→ and ⇧→ drive the player from a keyboard; ⌘R/Ctrl+R syncs.

**Settings** — download over Wi-Fi only, download what you're playing, download the next episode.
All three default on, and a line at the bottom says what iCloud is doing. Its overflow menu also
has **Clear Data and Resync**, which throws away everything held locally and fetches it again —
the escape hatch for a copy that has drifted, which ordinary syncing can't repair because a delta
only ever asks for what changed since a cursor the device no longer trusts. It takes the
downloads with it, and confirms first; on iOS the played state, positions and stars come back
from iCloud on the way out.

**In the car** — the shows list, each row carrying its cover, and each show's episodes, with
starred shows first, driving the same player as the phone: CarPlay templates on iOS, an Android
Auto browse tree on Android. Anything downloaded plays from disk, which is the case that
actually matters in a car park.

**Elsewhere** — lock screen and Control Centre / notification metadata and transport controls,
background audio, and headphone and steering-wheel buttons.

## Design

Both apps wear the network's own visual language, read off glasscannonnetwork.com: the `#03253F`
navy ground, the sky-blue gradient at their angle, and Open Sans. Their display face is Babell,
which isn't licensed for this, so Archivo Black stands in. The apps are dark-only by design — the
network has no light mode, and a light variant would strand the navy that carries the identity.
On Android that also means Material You dynamic colour is deliberately off.

The gradient is a verb: it marks the thing that plays, once per screen. Red means one thing only —
a show has published something you haven't heard.

The app icons and launch screens use the network's real logo. That's fine for a pitch build; it
needs their written permission before any public release on either store.

---

## The iOS app

Version 1.0 (build 3) · bundle id `bencreswell.gcpplayer` · iOS 17+ · iPhone and iPad.

| File | Role |
| --- | --- |
| [`Models.swift`](iOS/GCP%20Player/Models.swift) | The SwiftData schema: `Show` and `Episode`, plus the local state — played, position, download bookkeeping, starred. |
| [`AppDatabase.swift`](iOS/GCP%20Player/AppDatabase.swift) | One shared `ModelContainer`, so the CarPlay scene reads the same store as the phone. |
| [`ContentView.swift`](iOS/GCP%20Player/ContentView.swift) | Where the app decides what shape it is: one stack on a phone, a split view on an iPad. |
| [`ShowsModel.swift`](iOS/GCP%20Player/ShowsModel.swift) | The catalogue sync and the unplayed counts — no longer shown anywhere, but still what the NEW chip asks about. |
| [`ShowsSidebar.swift`](iOS/GCP%20Player/ShowsSidebar.swift) | The iPad's leading column: My Shows and All Shows as sections, not a toggle. |
| [`ShowsGridView.swift`](iOS/GCP%20Player/ShowsGridView.swift) | The poster wall the iPad shows before a show is picked — covers at the size they were drawn at. |
| [`APIClient.swift`](iOS/GCP%20Player/APIClient.swift) | The catalogue API: base URL, wire types, the two GET calls. |
| [`SyncEngine.swift`](iOS/GCP%20Player/SyncEngine.swift) | Applies the API's deltas — including tombstones — to the local database, without touching this device's own state. |
| [`CloudSyncEngine.swift`](iOS/GCP%20Player/CloudSyncEngine.swift) | The other direction: played, position and starred carried between the user's own devices over CloudKit. |
| [`PlayerModel.swift`](iOS/GCP%20Player/PlayerModel.swift) | The single source of truth for playback, and everything the system sees of it. |
| [`DownloadManager.swift`](iOS/GCP%20Player/DownloadManager.swift) | Background downloads, the seven-day sweep, the manual-download flag. |
| [`ArtworkView.swift`](iOS/GCP%20Player/ArtworkView.swift) | Artwork fetched at the size it's drawn at, downsampled off the main thread, kept on disk. |
| [`Theme.swift`](iOS/GCP%20Player/Theme.swift) | The design tokens and the shared components built from them. |
| [`CarPlaySceneDelegate.swift`](iOS/GCP%20Player/CarPlaySceneDelegate.swift) | The car screen. Templates only — same database, same player. |

Screens are `ShowsView`, `ShowView`, `EpisodeView`, `NowPlayingView` and `MiniPlayerBar`, with
`ContentView` owning the navigation and the player.

### On iPad

The phone layout is a stack — shows, a show, an episode, with the player behind a bar — because
that is the compromise a phone has to make. Given a regular width the shows leave that stack and
become a sidebar that is always there, and the middle is one push deep instead of two.

**Size class decides it, never the device.** An iPad in Slide Over is 320 pt wide — narrower than
the iPhone this was drawn for — and gets the phone's layout exactly. That is also what keeps the
phone from regressing while the iPad changes: the compact case *is* the old code path.

| Size class | Shows | Detail | Player |
| --- | --- | --- | --- |
| Regular | Sidebar, 280–360 pt | Beside it, one push deep | Full-width bar, and the dialog |
| Compact | Root of the stack | Pushed | Full-width bar, and the sheet |

**The player is the same in both, deliberately.** It was a column of its own on the widest
layouts for a while, and 340 pt of permanent player beside a 320 pt sidebar left the thing you
were actually reading — sixty episodes of a show — squeezed into what was left. So the mini bar
runs the full width of the window, over both columns, and tapping it opens the same player the
phone opens; at a regular width iPadOS presents that as a centred dialog.

What the extra room is spent on:

- **Two sections instead of a toggle.** My Shows and All Shows are both simply shown. The
  segmented toggle exists on the phone because there is room for one list at a time, and it pays
  for that by hiding half the catalogue — the car has made the same trade the other way since it
  was written.
- **A poster wall** where a split view would otherwise say "Select a show": every cover at
  190–230 pt, which is the only place the network's artwork has ever been shown at the size it
  was drawn at.
- **Full-bleed art, capped text.** The show's hero grows to 380 pt and spans the column; the
  episode list stops at a 760 pt measure and centres. A title set across 900 pt is unreadable and
  the row's chip-title-menu rhythm comes apart when its middle stretches.
- **Keys**: space, ← and → for the transport (the same 15/30 as the lock screen), ⇧→ for the next
  episode, ⌘R to sync, ⌘, for Settings.

The one thing to know about the split view's state: changing the sidebar selection clears the
detail column's pushed path. Without that you land on an episode that isn't in the list beside
it.

### How it syncs

On launch and on pull-to-refresh: a delta of the shows that changed, then an episode delta for
each of those. Which shows come back is the *only* signal the app needs — the API marks a show
whenever its episodes change, not just when its own fields are edited, so a show that isn't in
the delta has nothing new underneath it either.

In the steady state that is **one request**. Measured: 33 on the first launch (nothing known
yet), **1** on the second, and **2** on the third after an episode was deleted — the show list,
and the affected show alone.

Rows that come back carrying `deletedAt` are tombstones: the app deletes its copy, and frees
whatever it had downloaded of it. Verified by deleting two episodes through the API and watching
the show go 50 → 48 on the phone.

Most of those requests never reach the API's database — public reads are cached at the edge for
an hour. That only works because every client converges on the same cursor, which is why
`syncedAt` is the whole collection's newest timestamp rather than the newest row in one
response. Edits don't have to wait for the hour: every read is tagged, and every write purges
the tags it changed.

Nothing about offline changes. The local database is still the thing the app reads; a failed
sync leaves it untouched and everything — including downloaded audio — keeps working. Played
state, positions, downloads and starred shows are the device's own, and the catalogue sync never
writes them — carrying three of them to the user's *other* devices is a separate path entirely,
below.

### How progress syncs

The API has never heard of what you've played, and shouldn't — it serves a public catalogue and
has no accounts. So the three fields that are genuinely the user's travel a second path:
`Episode.isPlayed`, `Episode.positionSeconds` and `Show.isStarred`, through their own iCloud
account, on [`CKSyncEngine`](https://developer.apple.com/documentation/cloudkit/cksyncengine) —
CloudKit's own sync engine, which owns the scheduling, batching, retries, the database
subscription and the silent pushes that wake the app when the other device writes.

One custom zone, `ListeningState`, in the private database; one small record per episode or show
that has actually been touched, so a listener with fifty played episodes has fifty records and
not 1,279. Nothing else goes up. Episode record names are a SHA-256 of the guid, because feed
guids are URLs and a record name can't hold a slash; the guid itself travels as a field.

Four rules, and every awkward case is one of them:

- **The later change wins**, on a stamp the app keeps itself (`stateUpdatedAt`) rather than
  CloudKit's modification date, which says when a *record* was written and not when anyone did
  anything. The device that loses re-sends its copy, so a disagreement ends instead of
  ping-ponging. A tie — two devices carrying the same seed stamp from before this existed —
  merges rather than picks: heard beats unheard, further in beats nearer the start.
- **The device that is playing wins.** A record arriving for the episode in the player is never
  applied. Nothing moves the playhead under a listener.
- **Positions go up when you stop, not while you go.** The player writes a position to the
  database every five seconds; iCloud hears about it on pausing, scrubbing, finishing,
  backgrounding, and otherwise at most every two minutes.
- **State can arrive before the rows it belongs to.** A new install asks iCloud and the API at
  the same time and iCloud usually answers first, so an orphan is parked in
  `PendingListeningState` and claimed by `SyncEngine` once the episode exists. Without that, a
  fresh device would silently drop the history it was installed to get back.

Two things that follow from having the entitlement at all, both of which bite silently:
`ModelConfiguration` mirrors the **whole store** to CloudKit by default once an app has an iCloud
container, which this schema can't satisfy — unique constraints aren't allowed — so
[`AppDatabase.swift`](iOS/GCP%20Player/AppDatabase.swift) sets `cloudKitDatabase: .none` and the
store simply refuses to open without it. And a Simulator can't receive the silent pushes at all,
so changes land there only when the app comes forward and asks.

`APIBaseURL` in [`Info.plist`](iOS/Info.plist) says where the API is. A launch argument
overrides it, so a build can be pointed at a local checkout without rebuilding:

```
-APIBaseURL http://localhost:7331
```

### Building it

Open `iOS/GCP Player.xcodeproj`. Universal (`TARGETED_DEVICE_FAMILY = 1,2`); the iPad needs its
own `INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad`, and a missing one is what makes a
universal build refuse to rotate. Team `4TU829QS8N`, automatic signing, CarPlay entitlement
granted for this bundle id, and iCloud ▸ CloudKit on the container `iCloud.bencreswell.gcpplayer` (adding
that capability in Xcode is what creates the container, and it brings the Push Notifications
capability with it — `CKSyncEngine` needs the APNs entitlement but no notification code). Before
a build reaches TestFlight, the CloudKit schema has to be promoted in the CloudKit console:
Deploy Schema Changes ▸ Production. A development build creates the record types on first write;
a production one can't, and fails at runtime rather than at build time. Settings ▸ iCloud says so when that happens, with CloudKit's own reason. That includes the
`PatreonCredential` record type, whose `token` is an encrypted field. To ship a build by hand, bump `CURRENT_PROJECT_VERSION`, Product ▸ Archive,
then Distribute App ▸ App Store Connect ▸ Upload.

On Xcode Cloud the build number looks after itself:
[`ci_scripts/ci_pre_xcodebuild.sh`](iOS/ci_scripts/ci_pre_xcodebuild.sh) stamps
`CURRENT_PROJECT_VERSION` from `CI_BUILD_NUMBER` before each `xcodebuild`, in the throwaway
checkout only. `MARKETING_VERSION` is left alone — that one is a decision, not a counter. The
script no-ops outside Xcode Cloud, so running it locally can't stamp your working copy.

Xcode Cloud archives with `CODE_SIGN_IDENTITY=-`, and `com.apple.developer.carplay-audio` is a
restricted entitlement that can't be ad-hoc signed — an archive that dies on
"entitlements that require signing with a development certificate" is that, not a code error.
Those settings arrive on the `xcodebuild` command line, which outranks every project setting, so
the fix is in the workflow's App Store Connect app record, not in here.

## The Android app

Version 1.0 (versionCode 1) · application id `com.bencreswell.gcpplayer` · minSdk 26 · phone
and tablet, plus Android Auto. Never signed or published.

| Area | Role |
| --- | --- |
| `data/db/` | Room: `GcpDatabase`, `ShowDao`, `EpisodeDao`, `PatreonDao`. The unplayed count the NEW chip reads is one `GROUP BY` query rather than a count per row. |
| `data/patreon/` | The Patreon token, and the patron's own feed: where a Patreon episode's audio and runtime come from. |
| `data/api/` | The catalogue client and the two envelope shapes, read with hand-written `org.json` rather than a binding library. |
| `data/sync/SyncEngine.kt` | Applies a delta to the local copy — what a `?since=` cursor means on this side, including tombstones. |
| `data/repo/LibraryRepository.kt` | The library plus local state. Everything that marks an episode played goes through here, because that's also where its download is freed. |
| `data/settings/SettingsStore.kt` | DataStore: the three download preferences, and the last-played guid. |
| `playback/PlaybackService.kt` | A Media3 `MediaLibraryService`: the player, the media session, the car's browse tree, and everything that has to happen with no screen open. |
| `playback/PlayerController.kt` | What the UI talks to — a `MediaController` bound to that session, so there is exactly one player. |
| `playback/Downloads.kt` | The download cache, the Wi-Fi-only requirement, the played / seven-day sweep, the manual flag. |
| `playback/EpisodeAudio.kt` | Where an episode plays or downloads from — the download, Patreon, or the public feed — for the phone, the car and the downloader alike. |
| `ui/theme/` | The same tokens as `Theme.swift`, as Compose colours, type and brushes. |
| `ui/` | `GcpApp` (the phone's stack, or the tablet's split view, and the mini player) over `shows/`, `show/`, `episode/`, `nowplaying/`, `settings/`, `wide/`. |

The deeper "why it's shaped this way" notes — the toolchain pins, the three things Media3 gives
for free, where the structure deliberately differs from iOS — are in
[`android/README.md`](android/README.md).

### Building it

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
cd android && ./gradlew :app:installDebug
```

Use JDK 21, not the 25 bundled with Android Studio. `:app:connectedDebugAndroidTest` runs the 26
instrumented tests — the wire format, the sync rules, Patreon, and the car's browse tree over a
real `MediaBrowser`, which needs a device whose library has already synced. `-PapiBaseUrl=…`
points a build at another API, the counterpart of the iOS `-APIBaseURL` launch argument.

## The API

Hono on Vercel, Postgres on Neon, Prisma — everything in [`api/`](api), one folder, no workspace.

It reads the same nine feeds on a daily cron and reconciles them into the same shows and episodes,
then serves two delta endpoints the apps can sync against, cached at the edge for an hour:

```
GET /shows                            GET /shows/:id/episodes
GET /shows?since=<ISO>                GET /shows/:id/episodes?since=<ISO>
```

Plus write endpoints behind a staff session — email and an emailed six-digit code, no passwords
and no registration — so a mis-parsed title or an unattributed episode can be fixed by hand. That
is what the dashboard drives.

**Ingest is additive** — a published episode never changes, so the cron only ever inserts. A
daily re-ingest of an unchanged catalogue therefore writes nothing at all and every client gets
an empty delta. Adding an episode does mark its show, which is how a client knows to look
inside; and deletes are soft, because a delta can't report a row that is simply absent.
[`api/README.md`](api/README.md) covers the details and the places it needs care.

---

## The dashboard

A React app in [`dashboard/`](dashboard), wearing the same design as the phones. It exists for one
job above the others: nine episodes currently have no show, because their titles don't carry one in
any form the parser recognises, and giving one a show by hand is the single most useful edit this
product offers. The count rides in the navigation rather than waiting to be found.

Beyond that it edits shows and episodes, shows what the daily ingest has been doing — the numbers
on each run are the cheapest check that the feeds still parse the way they did — and manages who
may sign in.

Sign-in is an emailed six-digit code against a `staff` table, through the same Resend `otp`
template the Going Somewhere project uses. There are no passwords, no registration and no roles:
an address is on the staff list or it is not. Sessions are rows rather than JWTs, so removing
somebody ends their access immediately rather than whenever their token would have expired.

```bash
cd api && npm run db:staff -- you@example.com "Your Name"   # the first staff row
cd api && npm run dev                                       # 7331
cd dashboard && npm run dev                                 # 7350
```

With no mail provider configured the API writes the code to its own log instead of emailing it, so
signing in locally needs no inbox.

---

## Performance notes worth keeping

Three things that are easy to undo by accident:

- **Feed artwork is 3000×3000** (660 KB–1.5 MB each). It is never drawn at full size. Megaphone's
  imgix host is asked for the exact pixel size needed (660 KB → 8 KB for a list row) — both apps
  share that URL rewrite — and everything else is downsampled off the main thread and cached.
  Going back to `AsyncImage` on iOS would re-introduce a ~36 MB bitmap per row, decoded on the
  main thread.
- **Show lists never walk a show's episodes** to count things. On iOS that faults every episode of
  every show while scrolling, so the one count still taken — unheard, for the NEW chip — comes
  from a `fetchCount` query; on Android it comes from a single aggregate query.
- **Android's download bookkeeping is not mirrored into Room.** Media3's `DownloadIndex` already
  holds state, progress and timing; a second copy in the database would be a second truth. The
  iOS `downloadFileName` / `downloadedAt` columns exist only because `URLSession` offers nothing
  equivalent.
