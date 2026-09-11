# WP-3.0 — Visual refresh (Apple-light)
**Stage:** 3 · **Depends on:** 3.1, 3.2 · **ADRs:** 013 (supersedes part of 010), 002 · **Sessions:** 1–2

## Goal
The app stops looking like scaffolding. Every surface in the shell is rebuilt on one decided foundation — system face, a real type ramp, an 8-point rhythm, four radii, elevation instead of 1px walls, a drawn icon set, and motion — in the macOS light idiom Bryce chose from the design canvas (Concept A, "Sonoma"). Nothing about *what* the app does changes.

## Scope
- **In:** `tokens.css` (the whole foundation), `global.css`, a drawn icon set, and every `.module.css` in `src/`. The Paper palette moves to neutral greys per ADR-013. Hover, focus-visible, active and disabled states on every control. The Appearance screen's defaults and font list follow.
- **Out:** Ink's colours (ADR-013 §3 — unchanged here, and still awaiting Bryce's Gate 0 approval); the editor's *reading* typography (measure, leading, faces — WP-3.2 settled those and they are user settings, not chrome); any new screen, panel or behaviour; window chrome/titlebar integration (Tauri decorations stay as they are).

## Design
- **One foundation, in `tokens.css`.** The seven ADR-010 colour tokens keep their names and their editability; their Paper values change. Everything new — ramp, spacing, radii, shadows, motion, secondary/tertiary text — sits beside them as tokens so no component invents a value. Secondary and tertiary text are `color-mix` over `--aml-text`, so a user who edits the text colour gets a consistent hierarchy for free rather than a mismatched grey.
- **`opacity` is not a text colour.** Every `opacity: 0.6` on a label becomes `color: var(--aml-text-2)` or `--aml-text-3`. Opacity dimmed the element's background and its focus ring along with its text; that is why hover states looked broken on muted rows.
- **Elevation replaces walls.** Popovers, dialogs, menus and inspector cards drop their 1px `--aml-muted` border for `--aml-shadow-2`/`-3`, which includes a ½px ring. A 1px border survives only between *regions* (sidebar ↔ content, status bar ↔ body), which is what macOS does.
- **Icons are drawn, not typed.** `src/app/icons.tsx` exports a single `<Icon name=… />` with a 16px, 1.3px-stroke, `currentColor` set. It replaces ◧ ◨ ↺ ✎ ▸ ▾ ‹ › × and the 8px ● dirty marker (now a CSS dot). Keyboard glyphs stay as characters. Every icon-only control keeps its existing `aria-label`/`title`; the SVG is `aria-hidden`.
- **Motion, once.** Three durations and one easing curve, with a single global `prefers-reduced-motion` rule that zeroes them — cheaper and more reliable than remembering the media query in twenty files, and it puts a down-payment on WP-8.4.
- **Dependencies:** none added. ADR-002's "CSS custom properties + CSS Modules" is exactly what makes this a token change.

## Acceptance criteria
- [x] `tokens.css` carries the ADR-013 foundation; no `.module.css` contains a raw hex, a bare `px` radius, or `opacity` used as a text colour (unit test greps the stylesheets).
- [x] The Paper defaults in `features/appearance/tokens.ts` match `tokens.css` exactly, so "Reset to AML" restores ADR-013's colours and not ADR-010's (unit test compares the two files).
- [x] `docs/qa/contrast-report.md` is regenerated and every pair marked `text` still passes 4.5:1; the unit test that pins one pair moves to the new number.
- [x] A user's saved colour overrides still win over the new defaults, and clearing one falls back to ADR-013's value (existing WP-3.2 unit + e2e tests, updated for the new hexes).
- [x] E2E: the shell renders with the new tokens, icon-only controls keep their accessible names, and every existing spec still passes untouched except where it asserted an old hex.
- [x] Screenshots in `docs/qa/screens/` refreshed for the Welcome, Overview, a note in Desk layout and the Appearance screen, in both modes (`node scripts/screens.mjs`).
- [ ] **Gate 3:** Bryce's own look at it on screen (`docs/qa/stage-3.md` §9–§11).

## Lessons recorded
- A bare `:focus-visible { outline }` also rings the editor: ProseMirror gives its contenteditable a `tabindex`, and it stays focused for as long as you are writing. Caught by looking at the running app, not by any test — the rule now lists the controls it applies to and excludes `[contenteditable]`.
- Five view names do not fit a 250px panel on one line, and a ragged flex wrap reads as two separate controls. A three-column grid with a deliberate empty cell reads as one. Shortening "Boundings" would have fixed the width and broken ADR-011.
- `scripts/screens.mjs` already existed from WP-1.3 and I rewrote it without reading it first. The new one supersedes it (both modes, 2×, a fixed 1440×900, named per stage) and the stage-0/stage-1 PNGs it produced are still committed — but the right order is read, then replace.
- A dot that only exists on days that have a note makes the week strip change height as you write. The slot is always there now; only its colour changes.

## Tests
- Unit: stylesheet lint (no raw hex / raw radius / text-opacity in `src/**/*.module.css`); `tokens.ts` defaults ≡ `tokens.css` `:root`; contrast pin.
- E2E: existing suite, updated hexes only.
- Manual QA: `docs/qa/stage-3.md` §9.

## Docs to update
`docs/02-ARCHITECTURE-DECISIONS.md` (ADR-013 — done), `docs/ARCHITECTURE.md` (§ shell, new `src/app/icons.tsx`), `docs/CHANGELOG.md`, `docs/qa/stage-3.md` §9, `CLAUDE.md` status line, `docs/01-DEVELOPMENT-PLAN.md` (WP-3.0 inserted).

## Not in this work package
- Ink's palette (ADR-013 §3).
- A component library or a Storybook — CSS Modules per feature stays (ADR-002).
- Window-level vibrancy/translucency: it needs Tauri window flags and behaves differently on Windows, so it belongs with WP-8.x if it is ever wanted.
