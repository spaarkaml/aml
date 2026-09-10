# WP-2.7 — Templates and Daily notes
**Stage:** 2 · **Depends on:** 1.1, 1.5 · **ADRs:** 001, 011 · **Sessions:** 1

## Goal
Templates in `_templates/` with placeholders, a Daily note a keystroke away, and a calendar strip to move between days.

## Design
- **Templates** are `.md` files in `_templates/` (ADR-011's reserved folder). `templates_list` reports each one's name, path and front-matter `type:` — the last is unused until Note Types (WP-3.3), but the templates are already where that will read them.
- **Placeholders** are expanded in Rust (`src-tauri/src/templates.rs`): `{{title}}`, `{{time}}`, and `{{date}}` / `{{yesterday}}` / `{{tomorrow}}`, each of which takes an optional format — `{{date:dddd D MMMM YYYY}}` — with the tokens `YYYY YY MMMM MMM MM M dddd ddd DD D`. A placeholder the renderer does not know is **left exactly as written**, the same promise Raw nodes make about markdown the parser does not model.
- **Who owns "now":** the frontend, because only it knows the device's timezone; it passes the date as `YYYY-MM-DD` and the time as `HH:MM`. Rust does the calendar arithmetic (Howard Hinnant's civil-date algorithm — leap years, month ends, weekday names) with no timezone anywhere in it, which is what makes rendering deterministic and unit-testable. No date crate is needed on either side.
- **Daily notes** live at `journal/YYYY/YYYY-MM-DD.md` (glossary §4). `daily_note(date, time)` opens that note, creating it from `_templates/daily.md` — or a built-in default, so "Today" works in a Folio that has no templates yet — and reports whether it created it. Existing notes are never overwritten. `daily_dates` lists what exists: it *writes* the year-foldered path but *reads* a flat `journal/YYYY-MM-DD.md` too, since other apps write them that way.
- **The calendar strip** is a fourth left-panel view (`features/daily/DailyPanel.tsx`): a week Monday-first with today outlined, a dot on days that have a note, arrows to page weeks, and the most recent Dailies beneath. `features/daily/dates.ts` does the local date maths — deliberately at midday, so stepping a day across a daylight-saving boundary cannot land on the wrong date.
- **Templates as commands:** each template registers a palette command ("New Scene Note"), re-registered whenever the Folio's templates change. The registry already hands back an unregister function, which is what makes a Folio-driven command list possible — and it is the shape WP-3.3's "New &lt;Type&gt;" commands will reuse. `⌘⇧D` / **Today's Daily Note** opens today's.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Civil dates round-trip, step across months, leap days and years, and name weekdays; the format tokens behave; unknown placeholders survive verbatim; `daily_path` is year-foldered; templates are listed with their type and Dailies are found at both depths (Rust tests `templates.rs`).
- [x] Local dates read the device's own day (not UTC), step correctly across daylight saving, and lay a week out from Monday (unit tests `features/daily/dates.test.ts`).
- [x] E2E: the strip shows this week with today marked; "Start today" creates the Daily with `{{date:…}}` expanded and marks the day; asking again opens the same note instead of overwriting it; the arrows page weeks; a template runs from the palette (`e2e/daily.spec.ts`).
- [ ] On your Folio: your own `_templates/daily.md` produces the Daily you want, and last week's notes are one click away (`docs/qa/stage-2.md` §16).

## Lessons recorded
- Chasing an intermittent e2e failure found a **real Command Palette bug**: hovering the list set the selection, and typing then narrowed the list without moving it, so Enter could run the wrong command — or nothing at all. The selection now returns to the top match on every keystroke. The palette also cleared its query in an effect *after* opening (which could wipe the first keystrokes) and now resets on close instead, and Enter acts on the value the field actually holds rather than the last rendered state.
- The flake was proven pre-existing by stashing the work in progress and re-running: worth doing before blaming the change in front of you.

## Not in this work package
- Note Types (colour, icon, type-specific properties) — WP-3.3, which builds on `TemplateInfo.noteType`.
- A template editor. Templates are markdown files; the Folio Browser already edits them.
