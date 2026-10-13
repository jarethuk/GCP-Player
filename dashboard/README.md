# GCP Player Dashboard

Where the catalogue gets fixed by hand. React, TypeScript, Vite, Tailwind 4,
Biome, Storybook — drawn with the web app's components from
[`../web-components`](../web-components).

The apps read the catalogue; this writes it. Everything it does goes through the
API's endpoints, so there is no second source of truth and no database
connection here at all.

```
dashboard/
├── vercel.json              # the SPA rewrite — see "Deploying"
├── .storybook/              # dark-only canvas, on the network's ground
└── src/
    ├── index.css            # Tailwind, the shared theme, the dashboard's ground rules
    ├── theme/               # tokens.css — old variable names, aliased to the shared theme
    ├── api/                 # client.ts, types.ts, hooks.ts
    ├── auth/                # AuthContext, SignInPage
    ├── components/          # the dashboard's components, built on the shared ones
    ├── pages/               # shows, a show, unattributed, syncs, staff
    └── lib/format.ts        # dates, durations, numbering, slugs
```

---

## What it's for

Four things, in the order they matter:

**Unattributed** — the worklist. Nine episodes currently have no show, because
their titles don't carry one in any form the parser recognises. Giving one a
show is the single most useful edit this product offers, and the count rides in
the navigation rather than waiting to be found. If several arrive at once, a
feed's format has changed and the fix is a match pattern, not nine edits.

**Shows** — every show, its episode count, and when it last published. Editing
one is mostly editing two load-bearing fields:

- **Title** is how episodes are attributed. The main feed encodes the show in
  the middle segment of every item's title and the parser matches this string
  exactly, so changing it silently orphans the next sync's episodes.
- **Match pattern** claims episodes whose titles never use that format at all
  (Cannon Fodder, GCN News Minute, Strange Aeons…). It is validated as a regex
  before it is sent — a bad one reaches the API as a perfectly good string and
  only fails hours later, on the next sync, nowhere near this form.

**A show** — its episodes, oldest first, which is the order you'd listen to a
campaign in. Each row carries the numbering chip, the cleaned title, and the
raw published title underneath, because the raw title is what the parser was
given and reading it is how you work out what went wrong. A chip with a dashed
border is a number the API derived from release order rather than read from a
feed.

**Feed syncs** — what the ingest has been doing, and the nine feeds it reads.
The numbers on each run are the cheapest check that the feeds still parse the
way they did: a jump in unattributed episodes, or a collapse in cross-posts
skipped, is a format change showing up as arithmetic before anyone notices it
on a phone.

Plus **Staff**, which is the whole of the account system — see below.

## Signing in

Email, then a six-digit code. There is no password and no way to register: an
address is on the staff list or it is not, and the only way onto it is for
somebody already on it to add you. No roles, either — everyone can do
everything, including removing each other. (The API refuses to remove the last
one; a dashboard nobody can sign in to has no endpoint that can fix itself.)

The session token lives in `localStorage` rather than a cookie. The API is a
different origin, and a cross-site cookie would need `SameSite=None` plus a
credentialed CORS allow-list — machinery whose only purpose would be to
reintroduce the CSRF surface a header-borne token doesn't have. The trade is
XSS: anything that can run script in this page can read the token. For an
internal catalogue editor that renders nothing a stranger wrote, that is the
right side of the trade. **If this ever renders user-supplied content, revisit
it.**

A stored token is only a claim, so the app asks `GET /auth/me` once on load
rather than trusting what is in storage — a session may have expired, or the
person may have been removed since. Any request coming back 401 from anywhere
drops straight through to the sign-in page.

## Design

The web app's, exactly: it is drawn with the same components. The theme —
the network's `#03253F` navy, both gradients at their published angles, Open
Sans, Archivo Black standing in for the unlicensed Babell — and the buttons,
chips, labels, headers, dialogs and icons all come from
[`../web-components`](../web-components), which the web app uses too. So the
sidebar is the web app's sidebar: the same eyebrow, display heading and
gradient rule, reading **Manage** where the web app reads Shows, over the same
rows — a rail, a 40-pixel tile, a title in display caps, a line under it.

What's left in `src/components` is the dashboard's own — tables, form fields,
the form dialog, toasts — drawn to match, plus thin wrappers that keep the
API the pages already used (`Button`, `Badge`, `MetaLabel`…) over the shared
pieces. The few CSS modules that remain read the old variable names, which
[`src/theme/tokens.css`](src/theme/tokens.css) maps onto the shared theme.
The phones' `Theme.swift` and `ui/theme` are still separate copies of the
values.

Dark-only, like the apps: the network has no light mode, and a light variant
would strand the navy that carries the identity. There is deliberately no
`prefers-color-scheme` block, and `<meta name="color-scheme" content="dark">`
is what stops the browser painting form controls and scrollbars light.

**The gradient is a verb.** In the apps it marks the thing that plays, once per
screen. There is nothing to play here, so it marks the one action a page is
actually for. If a page grows a second gradient button, one of them is wrong.
**Red means one thing only**: something needs a person — the unattributed
count, wearing the rail and chip a show with something new wears in the apps,
and the buttons that destroy things.

Components live in `src/components` with their stories beside them, so a
component and its documentation go stale together or not at all.

## Running it

```bash
npm install
npm run dev          # http://localhost:7350
npm run storybook    # http://localhost:7351
```

It needs the API running — `npm run dev` in [`../api`](../api), on 7331 — and a
staff row to sign in as:

```bash
cd ../api && npm run db:staff -- you@example.com "Your Name"
```

With no mail provider configured the API writes the sign-in code to its own log
instead of emailing it, so this needs no inbox. The sign-in page says so when
it is running in dev.

`VITE_API_BASE_URL` in `.env` says where the API is; point it at the deployment
to work against real data. 7350 and 7351 because everything below 7300 on this
machine is claimed by another project.

```bash
npm test          # 21 tests — the formatting and field helpers
npm run check     # biome
npm run typecheck # tsc
npm run build     # typecheck, then vite build
```

## Deploying

A static build, so it is a second Vercel project next to the API's: **Root
Directory** `dashboard`, and `VITE_API_BASE_URL` pointing at the deployed API.
`vercel.json` sets the build command, the output directory, and the one thing
a static host will not do on its own:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```

Every route below the root — `/shows`, `/shows/haunted-city`, `/staff` — exists
only in the browser's router. Vite's dev server and `vite preview` both fall
back to `index.html` for an unknown path, so this never shows up locally; a
static host has no such default, and a refresh or a pasted link 404s. The
rewrite hands those paths the app, which then reads the URL and renders the
right page.

It is a catch-all and does not need narrowing. Vercel checks the filesystem
*before* it applies rewrites, so `/assets/index-B6Q07MCy.js` — the fonts are
hashed into `/assets` too — is served as itself and never reach it — which
is also why `index.html` must reference assets root-absolutely, as Vite emits
them by default. A relative `./assets/…` would resolve against `/shows/` and
404 from exactly the deep links this exists to fix.

## Known gaps

- **Only the formatting helpers are unit-tested.** They are the ones with real
  edge cases — `formatDuration(3599)` printed `60m` until it didn't. The pages
  are verified by using them; there are no component tests yet, though
  `@testing-library/react` is installed and configured for when there are.
- **No optimistic updates.** Every mutation invalidates its query keys and
  refetches. The API does more on a write than the response shows — editing an
  episode moves its show's `updatedAt`, re-attributing one moves two shows — so
  patching the cache from a response would drift from what the server holds. A
  refetch is a few kilobytes and always right.
- **No episode creation.** `POST /episodes` exists and takes a guid, but an
  episode that isn't in a feed is a strange thing to want; editing and deleting
  cover every case that has come up.
- **The show list isn't paginated.** 32 shows, filtered in the browser. The
  episode list isn't either, and the longest show is ~400 rows, which the
  browser handles without complaint. Both would need work at ten times the size.
- **Not deployed anywhere yet**, though `vercel.json` is ready for it — see
  Deploying above.
