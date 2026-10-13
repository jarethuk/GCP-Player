# Web components

The theme and components the web app ([`../web`](../web)) and the dashboard
([`../dashboard`](../dashboard)) share, so the two are drawn from one set of
pieces rather than two that drift.

- **`src/theme.css`** — the network's palette, both gradients, Open Sans and
  Archivo Black (the files are in `fonts/`), as Tailwind 4 theme tokens, plus
  the `glass` and `meta` utilities. The same values as the iOS app's
  `Theme.swift`.
- **Components** — `Button`, `PillButton`, the round, glass and gradient play
  buttons, `Chip` and `LockChip`, `MetaLabel`, `DisplayHeader`, `Card`,
  `SegmentedPicker`, `Artwork`, `Menu`, `Modal`, `ConfirmDialog`,
  `AlertDialog`, `EmptyState`, `Spinner`, and the icons.

**Nothing here carries text of its own.** Every label — Cancel, Play, a
screen reader's name for a padlock — is a prop. The web app passes its words
from `copy/strings.yaml` (through `web/src/ui/Localized.tsx`); the dashboard
passes its own.

## Using it

It isn't published or built: each app depends on it as
`"@gcp/web-components": "file:../web-components"` and compiles the TypeScript
source itself, so a change here shows up in both on the next reload. Three
settings in each app make that work, and are already in place:

```ts
// vite.config.ts
resolve: { dedupe: ['react', 'react-dom'] },          // one React, the app's
server: { fs: { allow: ['.', '../web-components'] } }, // serve files from here
```

```jsonc
// tsconfig.json: check the components against the app's React types
"paths": { "react": ["./node_modules/@types/react"], "react/*": ["./node_modules/@types/react/*"], … }
```

```css
/* the app's stylesheet */
@import "tailwindcss";
@import "@gcp/web-components/theme.css";
```

`theme.css` carries `@source "./"`, so Tailwind generates the components'
classes in whichever app imports it.

On Vercel, both projects read this folder from outside their root directory,
which Vercel allows by default ("Include files outside the root directory in
the Build Step").

## Working on it

```bash
npm install
npm run storybook    # http://localhost:7362
npm run typecheck
npm run check        # biome
```

React is a peer dependency here and a dev dependency only for Storybook and
type-checking; the apps bring their own.
