# GCP Player API

The source of truth for the show and episode catalogue, and the thing the phone
apps sync from. Hono on Vercel, Postgres on Neon, Prisma, Vitest, Biome.

One folder, no workspace — everything from the schema to the feed parser to the
routes is in here.

```
api/
├── prisma/schema.prisma      # 6 models
├── prisma.config.ts          # connection URLs for the CLI (Prisma 7 moved them here)
├── scripts/add-staff.ts      # the first staff row; everything else needs a session
├── vercel.json               # rewrite-all + the ingest crons
├── api/index.ts              # the Vercel entrypoint (see "The doubled path" below)
└── src/
    ├── app.ts                # routes, CORS, error shape
    ├── server.ts             # local dev only, port 7331
    ├── db.ts env.ts cache.ts delta.ts touch.ts serialise.ts util.ts
    ├── auth.ts staff.ts secrets.ts email.ts rate-limit.ts   # signing in
    ├── feed/                 # sources, RSS parsing, title parsing, the plan, the runner
    └── routes/               # shows, episodes, cron, auth, staff, admin
```

---

## The one rule

**Ingest is additive.** A published episode never changes, so the cron only ever
inserts rows it has not seen — it never updates one.

That is not a micro-optimisation, it is what makes the delta endpoints
trustworthy. `updatedAt` therefore moves *only* when a person edits something,
so:

- a daily re-ingest of an unchanged catalogue writes nothing, and every client
  gets an empty delta instead of 1,279 rows;
- an edit can never be silently undone by the next cron run, so there is no need
  to track which fields were hand-set.

Verified rather than assumed: a second run against the same feeds creates 0 rows
and moves 0 `updatedAt` values.

### The one narrowing: ingest may fill a blank

A show seeded with only a title and a match pattern — the six that can only be
attributed by regex — has no artwork until its episodes turn up. Under a strict
reading of "never update", it would stay blank forever, and it did: GCN News
Minute shipped to the iOS app as an empty tile.

So ingest may set a field that is currently `null`, and may never overwrite one
that isn't. That keeps every property the additive rule is for: it converges
after a single run (verified — two further syncs move no `updatedAt` at all),
and it cannot undo an edit, because an edited field is not null.

### What that costs, and what to do about it

- **`audioUrl` can genuinely change.** This network has episodes on Megaphone,
  Acast *and* Anchor, so hosts have moved before, and a stale URL is a dead play
  button rather than a cosmetic problem. Fix it with `PATCH /episodes/:id`. If
  it happens often, narrow ingest to update that one field and nothing else.
- **Attribution is not retried.** An episode stored with no show stays that way
  even once its show exists. Three of the current nine would now parse — the
  `itemsUnattributed` count dropping between runs is the parser saying so.
  `GET /episodes/unattributed` is the worklist; `PATCH` is the fix.
- **Deletes are hard**, so a `?since=` delta cannot report a removed row. See
  below.

### A show is marked when its episodes change

Adding an episode bumps its show's `updatedAt`, and so does every hand-edit that
adds, removes or re-attributes one. That is what lets a client ask for the show
list and then fetch episodes **only for the shows that moved** — one request per
launch in the steady state instead of one per show.

It is an invariant, not an optimisation, and it is easy to break silently: an
episode write that forgets to mark its show is invisible to every client until
something else happens to touch it. So every such write goes through
[`touchShows`](src/touch.ts), including both sides of a re-attribution — the
show an episode is leaving has to be marked too.

It costs the additive rule nothing. A run that inserts no episodes marks no
shows and writes nothing, so an unchanged catalogue still produces an empty
delta; and stamping a timestamp cannot undo an edit, because it touches no
editable field. Verified: a steady-state run reports `showsTouched: 0` and moves
no timestamps, while re-adding two episodes reports `showsTouched: 1` and moves
exactly the one show.

### Episode numbers are derived where the feed has none

Most of the network's shows publish no episode number at all — Cannon Fodder,
GCN News Minute, the live shows — which leaves their rows without the chip every
other show has. Ingest numbers them by release order: **217 episodes across 16
shows** currently.

Only shows the feed *never* numbers. Two things in the real data rule out
anything cleverer:

- An unnumbered episode inside a *numbered* show is an announcement, not a
  missing number — "Time For Chaos RSS Feed Update", "Where Did Glass Cannon
  Network Presents Go?". Numbering those files them in the sequence as though
  they were episodes.
- Time For Chaos restarts at E1 every season (S1 E1–20, S2 E1–20…), so there is
  no "highest number so far" to continue from without colliding with a future
  episode.

`Episode.numberIsDerived` records which is which, and is on the wire. Without it
the next run could not tell a number it invented from one the network supplied,
and would stop filling the show it had just filled. Numbering continues from the
highest derived number already stored, so a run only appends — a back-catalogue
episode appearing later lands at the end rather than renumbering what is already
on people's phones.

### De-duplication is load-bearing

The network cross-posts: all 45 Haunted City episodes appear in both the main
feed and Haunted City's own, under **different guids**, so the unique index on
`guid` does not catch them. They are matched on show + cleaned title, main feed
first.

Additive ingest makes this sharper in two ways. A duplicate that gets in can
only be removed by hand, and the key set has to be seeded **from the database**
rather than built up within the run — otherwise the main feed 404ing once, then
succeeding, inserts its copies alongside the per-show feed's. The three client
apps get away with per-run state only because they always read all nine feeds
together.

### Patreon

Some shows exist only on the network's Patreon (Legacy of the Ancients, The
Secret Fire), and the public ones get their episodes there first — Blood of the
Wild's patrons are more than a season ahead of its public feed. Ingest reads
all of it, from Patreon's **public, unauthenticated** JSON, the same the
campaign page uses ([`src/feed/patreon.ts`](src/feed/patreon.ts)): the podcast
collections, then every post in each. That gives a title, a date and a duration.
It never gives audio, and nothing here ever holds a Patreon token.

- **`Show.patreonShowId`** is the collection id — the `show=` in a patron's
  feed URL. Ingest links a collection by title; `PATREON_SHOW_LINKS` in
  [`sources.ts`](src/feed/sources.ts) pins the four public shows, one of which
  ("The Glass Cannon Podcast | Shadowdark") would otherwise land on the wrong
  show. A collection with no show becomes one, with **`isPublic: false`**,
  which turns true — never back — the first time a public feed carries it.
- **A Patreon post is an episode with a null `audioUrl`** and its
  `patreonPostId`, under the guid `patreon:<post id>`. A patron's client
  fetches `https://www.patreon.com/rss/glasscannon?auth=<their token>&show=<patreonShowId>`
  itself and matches each item's `<guid>`, which is the bare post id.
- **An early release is promoted, not duplicated.** Patreon is planned after
  every public feed. A Patreon post whose show + title the public feed already
  has is a cross-post and is skipped. When the public feed catches up with one
  that is already stored, its item takes over *that* row — the audio,
  description and date become the public ones — and the guid stays
  `patreon:…`, because that is what every phone holding it keys on. The
  Patreon post never writes to the row again. Titles are compared without
  punctuation, because Patreon's "You're Not My Father!" is the feed's "You're
  Not My Father"; a real wording difference ("Haunters *in* the Dark") still
  leaves a second, locked row, for the dashboard to delete.
- **A public episode is linked to its Patreon re-post** — its `patreonPostId` is set —
  because Patreon's copy has no ads and a patron's client plays that instead. Only where
  exactly one post has that show + title, and never a post another row already holds: the
  column is unique, and one bad guess would fail the run's transaction.
- **`patreonPublishedAt`** is when Patreon published a row's post — on a Patreon row,
  and on a public row linked to one, where it can be months before `publishedAt`. A
  patron's client lists episodes by it.
- **A bare leading number in a Patreon title is not an episode number**: "2023 Holiday
  Special" is not episode 2,023.
- **Patreon posts are not de-duplicated among themselves** by title: every
  Shadowdark episode has a post called "After Dark Bonus Content".
- **Patreon's image URLs are signed** and expire within weeks, so a stored one
  never outranks the collection's current one, and episodes don't take them at
  all.
- **Hashes are unchanged for every row that predates this.** `isPublic` and
  `patreonPostId` join a fingerprint only when they differ from what an RSS row
  would carry. Verified: a sync from a catalogue `main` had just synced
  inserts the Patreon rows and re-stamps no existing one.

A Patreon failure is reported like a dead feed — `Patreon`, or `Patreon: <collection>`
in `failedFeeds` — and costs the run nothing else. These are Patreon's internal
endpoints, not its documented API, so that is the likeliest way this breaks.

A current run adds **543 Patreon episodes and 2 shows** on top of the RSS
numbers, with 170 Patreon posts skipped as re-posts of public episodes.

---

## Endpoints

| | |
| --- | --- |
| `GET /shows` | Every show. `fullResync: true`. |
| `GET /shows?since=<ISO>` | Shows with `updatedAt > since`. |
| `GET /shows/:id/episodes` | `:id` is the cuid **or** the slug. |
| `GET /shows/:id/episodes?since=<ISO>` | |
| `…?patreon=1` on either | Include Patreon: shows with `isPublic: false`, episodes with a null `audioUrl`. |
| `GET /episodes/unattributed` | The editing worklist. |
| `GET /episodes/:id` | |
| `GET /` | liveness |

Signing in — all public, and rate-limited:

| | |
| --- | --- |
| `POST /auth/code` | `{ email }`. Always 204. See "Signing in" below. |
| `POST /auth/session` | `{ email, code }` → `{ token, expiresAt, staff }`. |

Everything else needs `Authorization: Bearer <session token>` — the token from
`POST /auth/session`, not a shared secret:

| | |
| --- | --- |
| `GET /auth/me` · `DELETE /auth/session` | Who you are; signing out. |
| `POST /shows` · `PATCH /shows/:id` · `DELETE /shows/:id` | |
| `POST /episodes` · `PATCH /episodes/:id` · `DELETE /episodes/:id` | Addressed by episode id, **not** nested under a show — see below. |
| `GET /staff` · `POST /staff` · `PATCH /staff/:id` · `DELETE /staff/:id` | Who may edit. No roles. |
| `GET /admin/shows` | The show list with episode counts, for the dashboard. |
| `GET /admin/syncs` · `GET /admin/feeds` | The ingest's history, and the nine feeds. |
| `POST /admin/sync` | Runs the ingest now. |
| `POST /admin/resync` | Wipes the catalogue and rebuilds it. See below. |

| | |
| --- | --- |
| `GET /cron/sync` | `Bearer $CRON_SECRET`, and only that. |

Every delta response is the same envelope:

```json
{ "syncedAt": "2026-09-18T11:07:09.650Z", "fullResync": false, "shows": [ ... ] }
```

**Patreon is opt-in, per request.** The apps already installed decode
`audioUrl` as a string, and one null fails their whole sync, so without
`?patreon=1` a caller gets the catalogue as it was before Patreon — no
Patreon-only show and no episode it couldn't play. An early release reaches it
anyway, the moment it is promoted: that is when the row gains its `audioUrl`
and its `updatedAt` moves.

**`syncedAt` is the highest `updatedAt` in the response, not `now()`.** Using
the clock is the obvious version and it drops writes: a transaction that starts
before the response but commits after it carries an `updatedAt` below the
reading the client was given, so the client never asks for it again. Taking the
cursor from the data closes that window — which matters more on serverless than
anywhere else, because instances are many and short-lived. When a delta is
empty the client's own cursor is echoed back rather than advanced.

### Signing in

Email and a six-digit code, held in `Staff` and `StaffSession`. There is no
password, no registration endpoint, and no role column: an address is on the
staff list or it is not, and everyone on it can do everything — including
adding and removing each other. The catalogue is 32 shows maintained by a
handful of people, and a role model would be more machinery than there is
anything to protect.

The first row has to come from outside the API, because every way in needs a
session and a session needs a row:

```bash
npm run db:staff -- you@example.com "Your Name"
```

Four things are worth knowing about the flow:

- **`POST /auth/code` answers 204 for every address**, known or not. A different
  answer for a known one would make this a way to enumerate the staff list, and
  there is no registration to justify creating a row for a stranger.
- **`POST /auth/session` refuses with one message**, whatever went wrong. Wrong,
  expired, already spent and no-such-address are four different facts, and
  telling them apart is exactly what an attacker wants.
- **Codes are stored as an HMAC keyed on `SESSION_KEY`**, never in the clear. A
  keyed hash rather than a bare one because six digits is a million
  possibilities and a rainbow table over that space is trivial.
  `Staff.otpAttempts` caps a code at five guesses inside its ten minutes.
- **Sessions are rows, not JWTs.** That costs one indexed lookup per
  authenticated request, and buys the thing a self-contained token cannot do:
  removing somebody ends their access *now* rather than whenever their token
  would have expired. The `onDelete: Cascade` on `StaffSession` is the whole
  mechanism. The token itself is 32 bytes of CSPRNG, stored as a plain SHA-256
  — no key, because there is no search space to speed up, and because a session
  must survive `SESSION_KEY` being rotated.

The rate limiter (`src/rate-limit.ts`) is in memory and honest about it: on
Vercel each instance starts with empty buckets, so the effective allowance is
the limit times however many are warm. It is a brake on a script hammering one
connection, not a defence — the defence is `otpAttempts`, which is in the
database.

`CRON_SECRET` is now the cron's alone; a staff session is not accepted at
`/cron/sync`, and running the ingest by hand goes through `POST /admin/sync`
instead.

### Why episode writes are not nested under a show

They can't be. An episode the parser could not attribute has no show to nest
under, and attributing it is the single most useful edit this API offers. The
same applies to an episode orphaned by deleting its show. `/shows/:id/episodes`
stays a read endpoint; writes live at `/episodes/:id`.

### Deletes are soft, because a delta can't report an absence

A row that is simply gone reads exactly like a row that didn't change, so
`DELETE` sets `deletedAt` and bumps `updatedAt`. The tombstone then travels in
the next `?since=` response like any other change, and the client drops its
copy — which on a phone also means freeing whatever it had downloaded.

- **With a cursor**, tombstones are included. That is what they are for.
- **Without one**, they are not: a caller asking for today's catalogue has
  nothing to remove.

Deleting a show tombstones its episodes too, but leaves their `showId` alone.
Detaching them would file them in the unattributed worklist as though they
needed a home, and their tombstones would be unreachable anyway —
`/shows/:id/episodes` stops resolving the moment the show does. Clients learn to
drop them from the show's own tombstone.

The next cron run does **not** resurrect a hand-deleted episode: the plan's
"already seen" sets are built from every stored row, tombstones included, so its
guid is known and its cross-posted twin can't slip in to replace it. Verified —
a full ingest after two deletions creates nothing and leaves both deleted.

One trap worth naming: `@updatedAt` is applied by Prisma, not by Postgres, so
anything that changes these rows from *inside* the database — a foreign key's
`ON DELETE SET NULL`, a raw `UPDATE` — moves the data without moving the cursor,
and no client ever finds out. Every write here goes through Prisma for that
reason.

### Caching

Every public read is cached at the edge for an hour
([`src/cache.ts`](src/cache.ts)). The catalogue changes once a day, when the
cron runs, so almost every request can be answered without touching Postgres.

```
Cache-Control:            public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=86400
Vercel-CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

The split between `max-age` and `s-maxage` is deliberate. The phone apps sync on
launch *and* on pull-to-refresh, and a private cache would make pull-to-refresh
silently do nothing for an hour. The shared cache is what the database needs
protecting from; this keeps every request honest while still never reaching
Postgres. `stale-while-revalidate` means even the request that finds an expired
entry is served from the edge.

**What makes this actually work is the cursor.** Cache keys are the full URL, so
if an empty delta echoed back whatever `since` the caller happened to hold, every
client would keep its own slightly different value for ever and every request
would be a unique key — a cache that is never hit twice. Instead `syncedAt` is
the whole collection's newest `updatedAt`, so a client that is up to date and one
that is a month behind both end up requesting the *same* URL. Verified: a full
fetch, a `since=` that matches, and a `since=2020` all report the same
`syncedAt`.

Errors are never cached — an hour of edge-cached 401s would be much worse than
the blip. That guarantee lives in the app's error and not-found handlers rather
than in the route chain, because an auth rejection throws before route
middleware can run.

Writes are `no-store`, and they purge what they changed.

#### Turning it off

`ENABLE_VERCEL_CACHE=false` makes every response above `no-store` instead, drops
the CDN headers and the tag, and stops writes purging — with nothing stored,
a purge is a network round trip per write for no effect.

It is on when the variable is absent, so the deployed default is the cheap one,
and it accepts `true`/`false`, `1`/`0` or `yes`/`no`, because it gets typed into
the Vercel dashboard by hand and the spelling should not matter.

Two reasons to reach for it. The obvious one is editing the catalogue, where an
hour of stale answers is the entire point of the cache and exactly the wrong
thing. The more useful one is diagnostic: when a client is showing something
that looks wrong, flipping this off and asking again separates *a stale edge*
from *a wrong row*, which otherwise look identical from the outside and are
fixed in completely different places.

`no-store` rather than merely dropping `s-maxage`, because a toggle that left
some proxy in between holding a copy would not answer the question it exists to
answer.

#### Cache tags

Every public read carries `Vercel-Cache-Tag` (Vercel's own header — plain
`Cache-Tag` is ignored), and every write invalidates the tags it invalidated:

| Response | Tags |
| --- | --- |
| `GET /shows` | `shows` |
| `GET /shows/:id/episodes` | `show:<cuid>`, `episodes` |
| `GET /episodes/unattributed`, `GET /episodes/:id` | `episodes` |

The show tag is the show's **canonical id**, resolved at request time, not the
path parameter — this URL is reachable by slug *and* by cuid, and tagging each
with what the caller typed would leave one of them stale after a purge. That is
why `publicCache(...)` merges tags the handler supplies with the static ones.

Purging lives with the write that caused it, and mostly inside
[`touchShows`](src/touch.ts): the function that bumps a show's `updatedAt` is
also the one that purges the listings carrying it. Bumping a cursor the edge
then serves from an hour-old copy moves the data without anyone being able to
see it — the same failure as not bumping it at all. The cron purges too, when a
run actually created or filled something.

`invalidateByTag`, never `dangerouslyDeleteByTag`: a deleted entry revalidates
in the *foreground*, so every client waiting on a popular URL hits Postgres at
once — precisely the stampede the cache exists to prevent. Invalidation serves
the stale copy instantly and refreshes behind it.

The helper chunks at **16 tags per call** (Vercel's limit), de-duplicates, and
swallows failures: a missed purge means an edit shows up late, while a purge
that threw would lose the edit. Off Vercel it does nothing — `invalidateByTag`
resolves silently with no CDN to talk to, and the guard makes that explicit.

Tag limits worth knowing: 256 UTF-8 bytes per tag, 128 tags per response, and a
tag **must not contain a comma** — that is the delimiter, so one would silently
become two.

### Resync

```bash
curl -X POST "$API/admin/resync" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"confirm":"delete-everything-and-resync"}'
```

Deletes every show and episode, re-seeds, rebuilds from the feeds, and purges
the cache. For testing against a real deployment, where the alternative is
connecting to production Postgres by hand. It reports what it destroyed:

```json
{ "deleted": { "shows": 32, "episodes": 1279 }, "resynced": { "itemsCreated": 1279, … } }
```

`POST`, never `GET`: nothing that follows links should be able to empty the
catalogue, and it should not sit replayable in a browser history. The
confirmation string is required **on top of** the session — a browser can be
left open on an unattended laptop, and this endpoint would then be one stray
request away.

Deletes are **hard** here, deliberately, unlike `DELETE /shows/:id`: a soft
delete would leave ~1,300 tombstones for every client to process, only to be
told about the same episodes again under new ids a moment later. Clients survive
the round trip because they key on guid and slug, which the rebuild reproduces
exactly — what they see is every `updatedAt` moving, so they re-download once.

Re-seeding before the sync is not optional. Without it the six regex-attributed
shows lose their match patterns and several hundred episodes come back
unattributed; the test pins that ordering.

It takes ~0.5s locally. Against Neon over the network it will be slower — the
function's `maxDuration` is 60s, which should be ample, but it is the one
endpoint that could ever approach it.

---

## Running it

```bash
npm install
npm run db:migrate          # applies migrations
npm run db:seed             # 9 feed sources + 6 regex-attributed shows
npm run db:staff -- you@example.com "Your Name"   # the first staff row
npm run dev                 # http://localhost:7331

curl localhost:7331/cron/sync -H "Authorization: Bearer $CRON_SECRET"
```

With `RESEND_API_KEY` unset — which is how `.env` ships — a sign-in code is
written to this server's log rather than emailed, so signing in locally needs
no inbox:

```
[email] sign-in code for you@example.com: 852745
```

`.env.example` documents the five variables. Locally the repo points at the
`gcp-postgres` container already running on **7332**, in its own `gcp_api`
database so the web project's data is untouched. Port 7331 for the API because
everything below 7300 on this machine is claimed by another project.

```bash
npm test          # 216 tests
npm run check     # biome
npm run typecheck # tsc
```

Tests are all offline — the route tests mock Prisma, and the feed tests are pure
functions over fixture XML.

## Deploying

Set the Vercel project's **Root Directory** to `api`, add the Neon integration,
and set `SESSION_KEY`, `CRON_SECRET`, `RESEND_API_KEY` and `RESEND_FROM`.
Without the two Resend variables nobody can sign in to a deployment at all —
the code goes to the platform log, which is not somewhere a person signing in
can read. The build runs `prisma generate && prisma migrate deploy && tsx
prisma/seed.ts`, and `vercel.json` registers the cron, shaped around when the network actually
publishes (measured over a year of episodes):

| Schedule (UTC) | Why |
| --- | --- |
| `0-20/10 4,5 * * *` | Every 10 min through the midnight-Eastern drop — 85% of episodes, at 00:00–00:10 ET. Both hours because Vercel runs on UTC, and midnight Eastern is 04:00 in summer and 05:00 in winter. |
| `*/10 13-22 * * *` | Every 10 min through the daytime releases — GCN News Minute (09:45–17:00 ET) and Shadowdark (12:00 ET), again spanning both offsets. |
| `30 0-3,6-12,23 * * *` | Hourly backstop for the rest of the day; the odd off-schedule release waits at most an hour. |

That is 78 runs a day at about two seconds each, and it needs the Pro plan:
Hobby allows one run a day and fires it anywhere in the hour. With the feeds'
own caches on top — Megaphone 3 min, Acast 6 min — a new episode is in the API
within about 10–15 minutes of going out.

Only runs that changed something or had a feed fail are kept, so the history is
the list of runs worth reading rather than 78 a day of nothing; a run killed
mid-way stays as RUNNING. Each run also deletes records older than seven days.

**The seed is part of the build** because migrations alone leave a new
environment empty, and an empty `FeedSource` table means the cron has nothing to
read: `/shows` answers `{"shows":[],"syncedAt":"1970-01-01T00:00:00.000Z"}`
forever and every client shows a blank catalogue with no error anywhere to
explain it. The seed upserts with `update: {}`, so Prisma issues no UPDATE at
all for a row that already exists and `updatedAt` never moves — running it on
every deploy costs nothing and does not push a full resync to every client.

**Episodes are not seeded**; they come from the feeds. A new environment has
shows but no episodes until the first sync, so trigger the cron once from the
Vercel dashboard (Settings ▸ Cron Jobs ▸ Run) rather than waiting for the next scheduled run.
By hand that is `curl -H "Authorization: Bearer $CRON_SECRET" <url>/cron/sync`,
which is safe to repeat: ingest is additive.

**`"framework": null`, and why it matters.** Vercel's project settings had the
Hono preset selected, which auto-detects `src/app.ts` and builds it as a second
function of its own — expecting a default export, where this app exports `app`
by name. The result was two lambdas: ours serving every route through the
rewrite, and the preset's broken one serving `/`, which answered
`FUNCTION_INVOCATION_FAILED` with *Invalid export found in module
"/var/task/api/src/app.js"* while every other path was fine. Pinning the
framework off in `vercel.json` rather than in the dashboard keeps it that way
for anyone who redeploys, and leaves exactly one function.

This is worth knowing about generally: a preset can add an entrypoint you never
asked for, and because it only claims the one path your own rewrite would have
handled last, everything else keeps working and the breakage looks like a
routing quirk rather than a second copy of the app.

**An empty `public/`, and why it has to exist.** Turning the preset off has a
second consequence, and it only shows up on the next deploy. With no framework,
Vercel treats the project as a plain build: it runs the build command and then
looks for a static output directory, defaulting to `public`. This build
generates the Prisma client, migrates and seeds — it emits no static files at
all — so the deploy failed *after* the seed had run, with *No Output Directory
named "public" found after the Build completed*. The directory is committed
empty to be found and left alone, and `outputDirectory` names it explicitly so
the requirement is visible in the config rather than implied by a default.

Nothing is ever served from it. Static files are matched before rewrites, and
there are none, so every path still falls through to `/api/index`.

Worth noting what the failure looked like: the build log ends with the seed
reporting success, and the error that follows is about a directory nobody
mentioned in the change that caused it. Turning off a framework preset does not
only remove what the preset added — it also moves the project onto a different
set of defaults.

**The doubled path.** Vercel discovers serverless functions in a directory
literally named `api/`, and this project's root directory is also called `api` —
hence `api/api/index.ts` from the repo root. It is not a mistake.

**Not `handle` from `hono/vercel`.** That adapter is for the Edge runtime: it
passes its argument straight to `app.fetch` as a Web `Request`. Prisma's query
compiler and node-postgres both need Node, and on the Node runtime Vercel calls
the default export with an `(IncomingMessage, ServerResponse)` pair instead — so
the first `c.req.header()` throws `this.raw.headers.get is not a function`, and
because nothing ever writes a response the function hangs until it times out.
Every route 504s, including the root. The entrypoint therefore exports
`getRequestListener(app.fetch)` from `@hono/node-server`, which is the
Node-shaped adapter; `@hono/node-server/vercel` was exactly that one line before
v2 dropped the export.

**Two connection strings.** `DATABASE_URL` is Neon's **pooled** endpoint, used at
runtime, because a serverless function opens a connection per invocation and
going direct exhausts Postgres' connection limit. `DATABASE_URL_UNPOOLED` is the
direct one, used only by `prisma migrate`: migrations need session-level locks
that pgbouncer's transaction mode cannot carry, and pointing migrate at the
pooler fails in ways that look like network flakes.

`@prisma/adapter-pg` rather than `@prisma/adapter-neon`, because node-postgres
speaks to Neon's pooled endpoint *and* to a plain local Postgres — one code path
for development and production.

`maxDuration` is raised to 60s for the cron. A cold ingest of all 1,279 episodes
takes ~1s locally; Vercel's 10s default would still be tight over the network on
a cold start.

## Known gaps

- **Tag purging is unverified against the real CDN.** Everything below the
  header is covered by tests — chunking, de-duplication, the off-platform
  guard, failures staying contained — but whether Vercel honours the tags can
  only be confirmed on a deploy.
- **Tombstones are never purged.** The table only grows, which at this size is
  nothing, and it means a client that has been offline for a year still syncs
  correctly rather than needing a full resync. If they ever are purged, clients
  older than the retention window must be told to start over — that is what
  `fullResync` is for.
- **No global `GET /episodes?since=`.** Not needed now that a show is marked
  when its episodes change: clients fetch the show list and then only the shows
  in it. The `[updatedAt, id]` index on episodes is there if one is ever wanted
  for other reasons.
- **No pagination.** 32 shows and ~100 episodes per show don't need it. The
  `[updatedAt, id]` indexes and ordering are already cursor-shaped for when they
  do.
- **`npm audit` reports 4 highs** in the `prisma` CLI's transitive dependencies
  (`mysql2`, `deepmerge-ts`). Nothing ships to the runtime and this is Postgres;
  `--force` would downgrade the CLI to 6.x and break the 7.10 client.
- **Both phone apps sync from here**, and neither parses a feed any more. That
  makes this the only title parser left: the counts a run reports are the only
  place a feed format change can now surface, which is why they are worth
  reading. See the ingest numbers in the root README.
