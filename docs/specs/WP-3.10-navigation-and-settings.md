# WP-3.10 — Home, a three-tab Browser, and Settings
**Stage:** 3 · **Depends on:** 2.7, 2.8, 3.0, 3.2 · **ADRs:** 004, 010, 011, 013 · **Sessions:** 1

## Goal
Reach the Overview whenever you want it, find every list in one line of tabs, and choose where
Daily notes are written.

## Design

### Home
The Overview was only reachable by closing every open note, which is a strange price for
looking at your week. The root breadcrumb — which was the Folio's name, spending a permanent
slice of the toolbar saying something the window title already says — is now the way Home.

- `tabs.showOverview()` sets the active note to `null` and pushes the note onto the back
  stack. Nothing closes: the tabs stay, and `⌘[` returns to where you were. This is why it
  is not `close()`, which would take the tab with it.
- The button's accessible name is `Overview — <Folio>` and it still contains the Folio's
  name as (visually hidden) text, so the trail reads as one thing to a screen reader and the
  breadcrumb is still a sentence. `aria-current="page"` marks it while the Overview is up.
- Also `⌘⇧H` and *Go to Overview* in the palette.

### Three tabs in the Browser
Five views (Folio, Tags, Search, Daily, Boundings) never fit one line in a 260px panel; WP-3.0
made the control a 3-column grid, which is two rows and a gap — a control that looks like two
controls. Three fit, so there are three: **Folio**, **Boundings**, **Search** (the magnifier,
not the word; it is the one label an icon says better).

The two that went did not lose their content — each moved next to what it is reached from,
which is one fewer tab *and* one fewer click:

- **Tags** sit at the foot of the Search view. Tags are a way of searching; you go looking for
  a tag for the same reason you go looking for a word.
- **The Daily strip** is the tray at the foot of the Folio view, sticky, so it stays in reach
  however far the tree is scrolled. The week and one button, *Open today's note*. The list of
  recent Dailies went: every one of them is a note in the tree directly above it, and the
  Overview already lists what you were last writing.

`leftView` is persisted per device, so the store migrates v1 → v2: a device left on `tags`
lands on `search`, one left on `daily` lands on `folio`, rather than on an empty panel.

### Settings
`⌘,` — the key macOS has meant *Settings* since before it was called that — now opens
**Settings**, with a toolbar button beside the palette. Appearance keeps its own screen
(it is long, and it previews live); Settings links to it, and to NAS Sync and the shortcuts
dialog, so there is one door to everything. Appearance's own key moves to `⌥⌘,`.

**The Daily notes folder** is the first setting. `journal/YYYY/YYYY-MM-DD.md` was hard-coded.
Now:

- It lives in `.aml/config.yaml` beside appearance, as `daily.folder`, because a Daily note
  has to land in the same place on both machines or the two calendar strips disagree with
  each other. There is no device layer here for that reason.
- `config.rs` gains `Preferences` the same shape as `Appearance` — every field optional,
  absent meaning AML's own, written as a line only when it is set. The two share the file and
  neither can drop the other's settings, which the round-trip test pins.
- `templates::daily_folder` tidies what is typed (trailing slashes, backslashes) and refuses
  anything that would leave the Folio: an empty segment, `.` or `..`. `preferences_write`
  returns what was actually stored, so the field shows the tidied value rather than what was
  typed, and a refusal comes back as an error the screen explains rather than a silent
  fallback. A hand-edited config file falls back to `journal` instead of erroring on open.
- Existing notes are not moved — said on screen, under the field. `daily_dates` reads the
  configured folder, so the strip and the dots follow the setting.
- The year folder stays: the setting names the parent, not the shape.

**Dependencies:** none added.

## Acceptance criteria
- [x] `daily_folder` tidies a typo and refuses anything that leaves the Folio; `daily_path`
      takes the folder; `daily_dir`/`daily_dates` read the setting (Rust tests `templates.rs`).
- [x] Preferences round-trip through the same file as appearance, each keeping the other, and
      clearing one removes its line rather than writing it empty (Rust test `config.rs`).
- [x] The settings store saves what Rust tidied, sends nothing at all for an empty field,
      keeps a refused folder on screen with the reason, and refreshes the strip and the tree
      (unit tests `features/settings/store.test.ts`).
- [x] A device on a left view that no longer exists is migrated to the tab that holds it now
      (unit test `features/layout/store.test.ts`).
- [x] E2E: Settings sends new Dailies to the named folder and the setting survives a reload;
      a folder that would leave the Folio is refused and said so; Settings opens from the
      toolbar and hands off to Appearance (`e2e/settings.spec.ts`).
- [x] E2E: Home shows the Overview without closing a tab, and `⌘[` returns (`e2e/tabs.spec.ts`).
- [x] E2E: tags are found under Search, the strip under the Folio tree (`tags`/`daily` specs).
- [ ] **Gate 3:** the Daily folder set on one machine is the folder the other writes into
      (`docs/qa/stage-3.md` §12). Needs the PC.

## Lessons recorded
- The Daily tray sat wherever the tree happened to end, because `margin-top: auto` needs a
  container with a height and `.left` had none: `min-height: 100%` against the panel body,
  and the tree grows with `flex: 1` rather than `min-height: 100%`. Caught by looking at the
  running app — nothing in the suite can see that a footer is in the wrong place.
- Replacing the Folio's name with an icon would have broken 22 e2e assertions that read the
  breadcrumb. Keeping the name as visually hidden text was not a way around the tests: it is
  what the button's accessible name should have been anyway, and the tests were right to
  expect the trail to still say where you are.

## Not in this work package
- A Settings screen with sections for everything: there is one setting worth having today.
  It is built to grow (its own `Preferences` struct and file section), not to be rewritten.
- Moving existing Daily notes when the folder changes. AML never moves a user's files behind
  their back; the Browser's drag-and-drop is how notes move.
- A per-device Daily folder. Deliberately refused above.
