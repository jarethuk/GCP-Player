# Copy

Every piece of user-facing text in the iPhone, iPad, Apple TV, Android and web
apps lives in one file: [`strings.yaml`](strings.yaml). Read it top to bottom and
you have read the apps — grouped by screen, in the order you meet them.

It works like a translation setup with one language. Each app uses its own
platform's native strings, generated from this file on every build:

```
copy/strings.yaml
      │  scripts/generate-copy.py
      ├─→ iOS/GCP Player/Copy.xcstrings       the String Catalog (table "Copy")
      ├─→ iOS/GCP Player/Copy.swift           Copy.Settings.wifiOnlyTitle, …
      ├─→ android/app/src/main/res/values/copy.xml   R.string.settings_wifi_only_title, …
      └─→ web/src/copy/copy.ts                Copy.Settings.wifiOnlyTitle, …
```

**Changing copy:** edit `strings.yaml` and build any app. Xcode runs the
generator in a Run Script phase ("Generate Copy", in both the iOS and tvOS
targets); Gradle runs it in a `generateCopy` task before every build; the web
app has `npm run copy`, and its build uses the checked-in file so Vercel needs
no Python. You can also run it by hand:

```bash
scripts/generate-copy.py            # write the generated files
scripts/generate-copy.py --check    # fail if they're out of date
```

The generated files are checked in, so a copy change shows up in review as a
diff of the YAML *and* of what each app will actually show. Never edit them
directly — the next build overwrites them.

## The format

A strict subset of YAML — the generator reads it with the standard library
alone, because it has to run on Xcode Cloud's system Python. Anything outside
the subset is an error with a line number.

```yaml
section:
  key: Plain text, to the end of the line.
  quoted: "Needed when the text starts with [ { \" or similar."
  long: >
    Folded: the lines under it are joined with single spaces, so long
    sentences can wrap in the file.
  withPlaceholder: "Go to {show}"                # a string
  withNumber: "{minutes:int} min"                # a number
  plural:
    one: One episode
    other: "{count:int} episodes"
  differsByPlatform:
    ios: On cellular, downloads wait until you're back on Wi-Fi.
    android: On mobile data, downloads wait until you're back on Wi-Fi.
  withMarkup: "Tap **Listen in app** or [log in](https://www.patreon.com/login)"
```

- **Keys** are camelCase and nest by screen. They become `Copy.Section.key` in
  Swift and `R.string.section_key` on Android.
- **Placeholders** are `{name}` or `{name:int}`. Swift and TypeScript get a
  function with those parameters in order; Android gets positional `%1$s` / `%1$d`.
- **Plurals** use the CLDR forms (`one`, `other`, and `zero`/`two`/`few`/`many` if
  ever needed), and must include `{count:int}` in at least one form.
- **`ios:` / `android:` / `web:`** only where the platforms genuinely differ —
  iCloud against Android's backup against "this browser", "cellular" against
  "mobile data". A string that varies must say what every platform gets.
  Everything else is one string for all.
- **`**bold**` and `[links](url)`** are the only markup. Swift gets an
  `AttributedString`; Android gets HTML it renders with `richStringResource`;
  the web gets a `Markdown` string it renders with `<RichText>`.
- **Case:** write the text as it reads. Buttons, chips and labels the design
  sets in capitals are uppercased in code, so the file stays readable and a
  screen reader says words rather than spelling them.
- **`a11y` keys** are accessibility-only: VoiceOver and TalkBack say them, the
  screen never shows them.

The staff dashboard (`dashboard/`) is a separate web app and is not included.
