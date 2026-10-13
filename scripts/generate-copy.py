#!/usr/bin/env python3
"""
Builds every app's strings from copy/strings.yaml — the one file all the
user-facing text in the iPhone, iPad, Apple TV, Android and web apps lives in.

    scripts/generate-copy.py                    # write every generated file
    scripts/generate-copy.py --check            # fail if any is out of date
    scripts/generate-copy.py --platform ios     # only one platform's — what each
    scripts/generate-copy.py --platform android #   build runs, since Xcode's script
    scripts/generate-copy.py --platform web     #   sandbox allows only declared outputs

Writes:

    iOS/GCP Player/Copy.xcstrings                  the String Catalog, table "Copy"
    iOS/GCP Player/Copy.swift                      `Copy.Settings.title` and friends
    android/app/src/main/res/values/copy.xml       R.string.settings_title and friends
    web/src/copy/copy.ts                           `Copy.Settings.title` and friends

Both builds run it (an Xcode Run Script phase, a Gradle task), so editing the
YAML and building is all it takes. A file is only rewritten when its contents
change, so an untouched YAML costs nothing.

Standard library only: this runs on Xcode Cloud and any Android CI with the
system python3 (3.9 on macOS), which has neither YAML nor TOML. So the YAML is
a small, strict subset — see parse() — and anything outside it is an error with
a line number rather than a guess.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "copy" / "strings.yaml"
XCSTRINGS = ROOT / "iOS" / "GCP Player" / "Copy.xcstrings"
SWIFT = ROOT / "iOS" / "GCP Player" / "Copy.swift"
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res" / "values" / "copy.xml"
WEB = ROOT / "web" / "src" / "copy" / "copy.ts"

PLATFORMS = {"ios", "android", "web"}
PLURALS = {"zero", "one", "two", "few", "many", "other"}
ARG = re.compile(r"\{([A-Za-z][A-Za-z0-9]*)(?::(int|string))?\}")
MARKDOWN = re.compile(r"\*\*.+?\*\*|\[[^\]]+\]\([^)]+\)")


class CopyError(Exception):
    pass


# -- Reading the YAML subset ---------------------------------------------------

def parse(text: str) -> dict:
    """
    The subset:

        # a comment                        comments, on their own line
        section:                           a map; children indented two spaces
          key: Plain text to the end       a plain value
          key: "Starts with [ or has #"    a double-quoted value (\\" and \\\\ escapes)
          key: >                           folded: the more-indented lines below,
            Joined into one line             joined with single spaces
            with spaces.

    Keys are letters and digits, starting with a letter.
    """
    root: dict = {}
    stack: list[tuple[int, dict]] = [(-1, root)]
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        raw = lines[i]
        number = i + 1
        i += 1
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "\t" in raw[: len(raw) - len(raw.lstrip())]:
            raise CopyError(f"line {number}: indent with spaces, not tabs")
        indent = len(raw) - len(raw.lstrip(" "))
        if indent % 2:
            raise CopyError(f"line {number}: indent by two spaces")

        match = re.match(r"([A-Za-z][A-Za-z0-9]*):(?:\s(.*))?$", stripped)
        if not match:
            raise CopyError(f"line {number}: expected `key:` or `key: value`, got {stripped!r}")
        key, value = match.group(1), (match.group(2) or "").strip()

        while stack[-1][0] >= indent:
            stack.pop()
        parent = stack[-1][1]
        if key in parent:
            raise CopyError(f"line {number}: `{key}` appears twice here")

        if value == "":
            child: dict = {}
            parent[key] = child
            stack.append((indent, child))
        elif value == ">":
            parts = []
            while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip(" ")) > indent):
                if lines[i].strip():
                    parts.append(lines[i].strip())
                i += 1
            if not parts:
                raise CopyError(f"line {number}: `{key}: >` has no text under it")
            parent[key] = " ".join(parts)
        elif value.startswith('"'):
            if not (len(value) >= 2 and value.endswith('"') and not value.endswith('\\"')):
                raise CopyError(f"line {number}: unterminated quoted value")
            parent[key] = re.sub(r'\\(["\\])', r"\1", value[1:-1])
        else:
            if value[0] in "[{&*!|'%@`":
                raise CopyError(f"line {number}: a value starting with {value[0]!r} must be in double quotes")
            parent[key] = value
    return root


# -- Flattening into entries ---------------------------------------------------

class Entry:
    """One string: its key, and its text per platform (and per plural form)."""

    def __init__(self, key: str, value):
        self.key = key
        # {platform: str | {quantity: str}}
        self.by_platform: dict[str, object] = {}
        if isinstance(value, dict) and set(value) <= PLATFORMS | {"default"} and set(value) & PLATFORMS:
            default = value.get("default")
            for platform in PLATFORMS:
                chosen = value.get(platform, default)
                if chosen is None:
                    raise CopyError(f"{key}: no text for {platform} (give `default:` or every platform)")
                self.by_platform[platform] = chosen
        else:
            for platform in PLATFORMS:
                self.by_platform[platform] = value
        for platform, text in self.by_platform.items():
            if isinstance(text, dict):
                if not set(text) <= PLURALS or "other" not in text:
                    raise CopyError(f"{key}: a plural needs `other:` and only {sorted(PLURALS)}")
        self.args = self._args()

    def texts(self, platform: str) -> list[str]:
        value = self.by_platform[platform]
        return list(value.values()) if isinstance(value, dict) else [value]

    def is_plural(self, platform: str) -> bool:
        return isinstance(self.by_platform[platform], dict)

    def is_markdown(self) -> bool:
        return any(MARKDOWN.search(t) for p in PLATFORMS for t in self.texts(p))

    def _args(self) -> list[tuple[str, str]]:
        """The placeholders, in first-seen order, with their types — and the same on every platform."""
        seen: dict[str, str] = {}
        for platform in sorted(PLATFORMS):
            for text in self.texts(platform):
                for name, kind in ARG.findall(text):
                    kind = kind or "string"
                    if seen.get(name, kind) != kind:
                        raise CopyError(f"{self.key}: {{{name}}} is used as both int and string")
                    seen[name] = kind
        for platform in PLATFORMS:
            for text in self.texts(platform):
                names = {n for n, _ in ARG.findall(text)}
                if self.is_plural(platform):
                    continue  # a form may leave the count out ("One episode")
                if names != set(seen):
                    raise CopyError(f"{self.key}: every platform's text must use the same placeholders")
        if any(self.is_plural(p) for p in PLATFORMS):
            if "count" not in seen:
                raise CopyError(f"{self.key}: a plural needs a {{count:int}} placeholder")
            seen["count"] = "int"
        return list(seen.items())


def flatten(tree: dict, prefix: str = "") -> list[Entry]:
    entries = []
    for key, value in tree.items():
        path = f"{prefix}.{key}" if prefix else key
        is_leaf = not isinstance(value, dict) or (
            set(value) <= PLATFORMS | {"default"} | PLURALS and (set(value) & (PLATFORMS | PLURALS))
        )
        if is_leaf:
            entries.append(Entry(path, value))
        else:
            entries.extend(flatten(value, path))
    return entries


# -- Placeholders per platform -------------------------------------------------

def to_format(entry: Entry, text: str, platform: str) -> str:
    """`{title}` / `{count:int}` → `%1$@` / `%1$lld` (iOS) or `%1$s` / `%1$d` (Android)."""
    positions = {name: i + 1 for i, (name, _) in enumerate(entry.args)}
    kinds = dict(entry.args)

    def replace(match: re.Match) -> str:
        name = match.group(1)
        n = positions[name]
        if platform == "ios":
            return f"%{n}$lld" if kinds[name] == "int" else f"%{n}$@"
        return f"%{n}$d" if kinds[name] == "int" else f"%{n}$s"

    escaped = text.replace("%", "%%") if entry.args else text
    return ARG.sub(replace, escaped)


# -- iOS -----------------------------------------------------------------------

def xcstrings(entries: list[Entry]) -> str:
    strings = {}
    for entry in entries:
        if entry.is_plural("ios"):
            forms = entry.by_platform["ios"]
            unit = {
                "variations": {
                    "plural": {
                        quantity: {"stringUnit": {"state": "translated", "value": to_format(entry, text, "ios")}}
                        for quantity, text in forms.items()
                    }
                }
            }
        else:
            unit = {"stringUnit": {"state": "translated", "value": to_format(entry, entry.texts("ios")[0], "ios")}}
        strings[entry.key] = {"extractionState": "manual", "localizations": {"en": unit}}
    catalog = {"sourceLanguage": "en", "strings": strings, "version": "1.0"}
    return json.dumps(catalog, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


# Keys that are Swift keywords are escaped rather than refused: `player.continue`
# is the right name for the key, and `Copy.Player.`continue`` is valid Swift.
SWIFT_KEYWORDS = {
    "associatedtype", "break", "case", "catch", "class", "continue", "default", "defer",
    "deinit", "do", "else", "enum", "extension", "fallthrough", "false", "fileprivate",
    "for", "func", "guard", "if", "import", "in", "init", "inout", "internal", "is", "let",
    "nil", "open", "operator", "private", "protocol", "public", "repeat", "rethrows",
    "return", "self", "static", "struct", "subscript", "super", "switch", "throw", "throws",
    "true", "try", "typealias", "var", "where", "while",
}


def swift_identifier(name: str) -> str:
    return f"`{name}`" if name in SWIFT_KEYWORDS else name


def swift_name(segment: str, type_name: bool) -> str:
    return segment[0].upper() + segment[1:] if type_name else segment


def swift(entries: list[Entry]) -> str:
    tree: dict = {}
    for entry in entries:
        *groups, leaf = entry.key.split(".")
        node = tree
        for group in groups:
            node = node.setdefault(swift_name(group, True), {})
        node[leaf] = entry

    out = [
        "// Generated by scripts/generate-copy.py from copy/strings.yaml — edit that, not this.",
        "//",
        "// Every piece of user-facing text in the app. Plain strings are `String`,",
        "// strings with **bold** or [links](…) are `AttributedString`, and strings",
        "// with placeholders are functions.",
        "",
        "import Foundation",
        "",
    ]

    def emit(node: dict, name: str, depth: int) -> None:
        pad = "    " * depth
        out.append(f"{pad}enum {name} {{")
        for key in node:
            value = node[key]
            if isinstance(value, dict):
                emit(value, key, depth + 1)
                continue
            entry: Entry = value
            doc = entry.texts("ios")[-1].replace("\n", " ")
            out.append(f"{pad}    /// {doc}")
            lookup = f'NSLocalizedString("{entry.key}", tableName: "Copy", comment: "")'
            if entry.args:
                params = ", ".join(
                    f"{'_ ' if i == 0 else ''}{n}: {'Int' if k == 'int' else 'String'}"
                    for i, (n, k) in enumerate(entry.args)
                )
                call = ", ".join(n for n, _ in entry.args)
                body = f"String.localizedStringWithFormat({lookup}, {call})"
                if entry.is_markdown():
                    out.append(f"{pad}    static func {swift_identifier(key)}({params}) -> AttributedString {{ markdown({body}) }}")
                else:
                    out.append(f"{pad}    static func {swift_identifier(key)}({params}) -> String {{ {body} }}")
            elif entry.is_markdown():
                out.append(f"{pad}    static var {swift_identifier(key)}: AttributedString {{ markdown({lookup}) }}")
            else:
                out.append(f"{pad}    static var {swift_identifier(key)}: String {{ {lookup} }}")
        out.append(f"{pad}}}")

    top = {"Copy": tree}
    emit(top["Copy"], "Copy", 0)
    out += [
        "",
        "/// Bold and links, as written in the YAML. Plain text if it doesn't parse.",
        "private func markdown(_ text: String) -> AttributedString {",
        "    (try? AttributedString(",
        "        markdown: text,",
        "        options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)",
        "    )) ?? AttributedString(text)",
        "}",
        "",
    ]
    return "\n".join(out)


# -- Android -------------------------------------------------------------------

def android_name(key: str) -> str:
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key).replace(".", "_").lower()


def android_text(entry: Entry, text: str) -> str:
    """
    Escaped for strings.xml. Markdown becomes HTML — kept as literal text, so
    `getString` hands it back intact for `AnnotatedString.fromHtml` to style.
    """
    value = to_format(entry, text, "android")
    if entry.is_markdown():
        value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
        value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', value)
    value = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    value = value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"').replace("\n", "\\n")
    if value[:1] in "@?":
        value = "\\" + value
    return value


def android(entries: list[Entry]) -> str:
    out = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<!-- Generated by scripts/generate-copy.py from copy/strings.yaml — edit that, not this. -->",
        '<resources xmlns:tools="http://schemas.android.com/tools">',
    ]
    for entry in entries:
        name = android_name(entry.key)
        # Plain `%` in a string with no placeholders would otherwise read as a format.
        formatted = "" if entry.args or "%" not in entry.texts("android")[0] else ' formatted="false"'
        if entry.is_plural("android"):
            out.append(f'    <plurals name="{name}">')
            for quantity, text in entry.by_platform["android"].items():
                out.append(f'        <item quantity="{quantity}">{android_text(entry, text)}</item>')
            out.append("    </plurals>")
        else:
            out.append(f'    <string name="{name}"{formatted}>{android_text(entry, entry.texts("android")[0])}</string>')
    out += ["</resources>", ""]
    return "\n".join(out)


# -- Web -----------------------------------------------------------------------

def ts_text(entry: Entry, text: str) -> str:
    """A template literal, with `{name}` as `${name}` and anything special escaped."""
    escaped = text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return "`" + ARG.sub(lambda m: "${" + m.group(1) + "}", escaped) + "`"


def ts_value(entry: Entry) -> str:
    kind = "Markdown" if entry.is_markdown() else None
    if entry.is_plural("web"):
        forms = entry.by_platform["web"]
        body = "plural(count, { " + ", ".join(f"{q}: {ts_text(entry, t)}" for q, t in forms.items()) + " })"
    else:
        body = ts_text(entry, entry.texts("web")[0])
    if kind:
        body = f"markdown({body})"
    if entry.args:
        params = ", ".join(f"{n}: {'number' if k == 'int' else 'string'}" for n, k in entry.args)
        return f"({params}) => {body}"
    return body


def typescript(entries: list[Entry]) -> str:
    tree: dict = {}
    for entry in entries:
        *groups, leaf = entry.key.split(".")
        node = tree
        for group in groups:
            node = node.setdefault(swift_name(group, True), {})
        node[leaf] = entry

    out = [
        "// Generated by scripts/generate-copy.py from copy/strings.yaml — edit that, not this.",
        "//",
        "// Every piece of user-facing text in the app. Plain strings are strings,",
        "// strings with **bold** or [links](…) are `Markdown` for <RichText>, and",
        "// strings with placeholders are functions.",
        "",
        "import { markdown, plural } from './runtime'",
        "",
    ]

    def emit(node: dict, depth: int) -> None:
        pad = "  " * depth
        for key, value in node.items():
            if isinstance(value, dict):
                out.append(f"{pad}{key}: {{")
                emit(value, depth + 1)
                out.append(f"{pad}}},")
                continue
            doc = value.texts("web")[-1].replace("\n", " ").replace("*/", "* /")
            out.append(f"{pad}/** {doc} */")
            out.append(f"{pad}{key}: {ts_value(value)},")

    out.append("export const Copy = {")
    emit(tree, 1)
    out += ["} as const", ""]
    return "\n".join(out)


# -- Main ------------------------------------------------------------------------

def main() -> int:
    check = "--check" in sys.argv
    platform = sys.argv[sys.argv.index("--platform") + 1] if "--platform" in sys.argv else None
    if platform not in (None, "ios", "android", "web"):
        print(f"--platform is ios, android or web, not {platform!r}", file=sys.stderr)
        return 2
    try:
        entries = flatten(parse(SOURCE.read_text(encoding="utf-8")))
    except CopyError as error:
        print(f"copy/strings.yaml: {error}", file=sys.stderr)
        return 1

    names: dict[str, str] = {}
    for entry in entries:
        name = android_name(entry.key)
        if name in names:
            print(f"copy/strings.yaml: {entry.key} and {names[name]} both become {name} on Android", file=sys.stderr)
            return 1
        names[name] = entry.key

    outputs = {}
    if platform in (None, "ios"):
        outputs.update({XCSTRINGS: xcstrings(entries), SWIFT: swift(entries)})
    if platform in (None, "android"):
        outputs[ANDROID] = android(entries)
    if platform in (None, "web"):
        outputs[WEB] = typescript(entries)
    stale = []
    for path, content in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == content:
            continue
        stale.append(path.relative_to(ROOT))
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    if check and stale:
        print("Out of date — run scripts/generate-copy.py:", *stale, sep="\n  ", file=sys.stderr)
        return 1
    if stale:
        print(f"copy: {len(entries)} strings; wrote", ", ".join(str(p) for p in stale))
    return 0


if __name__ == "__main__":
    sys.exit(main())
