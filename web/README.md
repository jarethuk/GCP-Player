# GCP Player for the web

The iPhone and iPad app, in a browser. React, Vite, TypeScript, Tailwind 4, Storybook; deployed on
Vercel. On a phone-sized window it is the iPhone app; given room for a sidebar it is the iPad's
split layout — the window decides, never the device, with the same thresholds as the Android
tablet layout (700 × 480).

```bash
npm install
npm run dev          # http://localhost:7360
npm test             # vitest
npm run check        # biome
npm run storybook    # http://localhost:7361
npm run build        # tsc, then vite build → dist/
```

Ports 7360/7361, not Vite's defaults — everything below 7300 on the dev machine belongs to another
project. `VITE_API_BASE_URL` points it at another API (see `.env.example`); production by default.

## What's the same as the phones

- **The catalogue sync** is a port of `SyncEngine.swift`: one delta of the shows that changed,
  then an episode delta per changed show from its own cursor, tombstones deleted, a failed show's
  cursor left alone, `?patreon=1` on every call. A visit with nothing new is one request, and the
  edge cache answers most of those.
- **IndexedDB is the local database** (`src/data/db.ts`). The whole library — 32 shows, ~1,800
  episodes — is read into memory once at start (`src/data/library.ts`), every screen reads from
  memory, and every write lands in memory then IndexedDB. Two tabs tell each other what they wrote
  over a `BroadcastChannel`.
- **The rules** — listening order, NEW, the padlock, which copy plays, the next episode — are
  ported one for one into `src/data/logic.ts` and `src/data/actions.ts`, with tests.
- **Patreon**: paste the RSS link in Settings; only the token is kept, in IndexedDB. Patreon
  episodes are always listed, padlocked without it. With it, Patreon's ad-free copy plays and its
  runtime is learnt from the feed, exactly as on the phones (`src/patreon/`).
- **The copy** comes from `copy/strings.yaml`, like both phone apps: `npm run copy` regenerates
  `src/copy/copy.ts`.

## What's different, and why

- **Downloads run only while the app is open** (`src/downloads/`). The file is streamed into Cache
  Storage — written to disk as it arrives, where IndexedDB would want all 80 MB in memory — and
  played back as a blob. There's no background session as on iOS, so closing the page cuts a
  download off, and the launch sweep clears what it left. It works the same in a browser tab as
  installed, automatic downloads included. "Wi-Fi only" is
  shown only where the browser says which network it's on (Chrome on Android). The service worker
  leaves the audio cache alone when it clears its own. The public audio hosts send
  `Access-Control-Allow-Origin: *` all the way down the redirect chain; if Patreon's audio host
  doesn't, a Patreon download falls back to the public copy where there is one.
- **No account yet**, so nothing crosses devices. Played, positions, stars and the Patreon token
  stay in this browser, and Settings says so where the phones say what iCloud is doing.
- **Patreon's feed goes through this site.** Patreon answers a successful feed request with no
  `Access-Control-Allow-Origin`, so a browser can't read it from another origin. `/patreon/rss` is
  rewritten to `https://www.patreon.com/rss/glasscannon` by `vercel.json` in production and
  proxied by `vite.config.ts` in development; the response is `private, no-store`. The audio
  itself plays straight from Patreon — an `<audio>` element needs no CORS.
- **Safari and the tap.** Safari only lets audio start inside a tap, and a Patreon episode's URL
  arrives a round trip later, so the player plays a tenth of a second of silence in the tap to
  unlock the element first.
- **The lock screen** is the Media Session API: title, show, "12 of 45", artwork, play/pause,
  15/30 skips, scrubbing and next track, from headsets and media keys too.
- **Keys**: space, ← / → (15 back, 30 forward) and ⇧→ (next episode), in both layouts. ⌘R is left
  to the browser — reloading syncs anyway. A tab that comes back after half an hour syncs again.
- **YouTube** opens in a new tab at the listening position, and pauses the player first, which
  the phones get for free when YouTube takes the audio session.

## Routing

| URL | Phone | Wide |
| --- | --- | --- |
| `/` | Shows list | Sidebar + poster wall |
| `/shows/:slug` | Show | Sidebar + show |
| `/shows/:slug/episodes/:id` | Episode | Sidebar + episode |
| `/settings` | Settings page | A sheet over whatever it was opened from |

Every URL works as a direct link. `vercel.json` sends everything that isn't a file, `/assets`,
`/patreon/` or `/_vercel/` (Vercel Web Analytics' script and endpoint) to `index.html`.

## Shared components

The theme (tokens, fonts, the gradients) and the generic components — buttons, chips, labels,
headers, menus, dialogs, icons — live in [`../web-components`](../web-components), shared with the
dashboard. It's a `file:` dependency built from source, so a change there shows up here on the next
reload. See its README.

## The app icon

`public/favicon.svg` is the source: a rounded sky-gradient play on a navy-to-blue tile. The PNGs
beside it are rendered from it — `icon-192/512.png` with its rounded corners (browser tabs,
desktop installs), and `icon-maskable-192/512.png` and the 180px `apple-touch-icon.png` full bleed,
because Android and iOS cut their own shape (the play sits well inside Android's safe circle).
`favicon.ico` is a 32px PNG in an ICO wrapper, for anything that asks for it by name. To change the
icon, edit the SVG and re-render all of them at those sizes; removing `rx="22"` gives the full-bleed
version.

## Deploying

A Vercel project with **Root Directory `web`**. Framework preset Vite, build `npm run build`,
output `dist` — all in `vercel.json`. The build reads `../web-components`, so leave Vercel's
"Include files outside the root directory" on (the default). The generated `src/copy/copy.ts` is checked in, so the
build doesn't need Python.

## Files

| Path | Role |
| --- | --- |
| `src/data/` | Types, IndexedDB, the in-memory library, the API client, the sync, the rules. |
| `src/patreon/` | Token extraction, the feed parser, the per-show feed cache. |
| `src/player/` | The `<audio>` player and Media Session, the mini bar, Now Playing, YouTube links. |
| `src/app/` | Services built at start, the hooks screens read them through, the catalogue sync owner. |
| `src/layout/` | `PhoneLayout` (one stack) and `WideLayout` (sidebar + detail), keyboard shortcuts. |
| `src/screens/` | Shows, show, episode, settings, the sidebar and the poster wall. |
| `src/ui/` | The show and episode rows, the episode menu, and `Localized.tsx`, which hands the shared components the app's copy. |
