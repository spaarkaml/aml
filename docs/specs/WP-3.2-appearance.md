# WP-3.2 — Appearance settings
**Stage:** 3 · **Depends on:** 0.4, 3.1 · **ADRs:** 004, 010 · **Sessions:** 1

## Goal
Every colour, face and measure in ADR-010, editable with live preview, saved with the Folio so they follow you between machines — and overridable on the one machine you want different.

## Design
- **Where settings live** (ADR-010): `.aml/config.yaml` in the Folio, so the look of the work travels with the work. The file is written one setting per line in a stable order, which is the rule for anything under `.aml/` — two devices changing different settings edit different lines.
- **Nothing else in the file is lost.** `config.rs` holds settings as dotted paths (`appearance.paper.bg`) and rewrites the whole file from them, so `version:` and `name:` — written when the Folio was created — survive, and so will the sections Stage 5 adds. An older AML must never silently drop a newer one's settings.
- **Two layers.** The Folio's settings apply unless *Keep this machine's own appearance* is on, in which case this device's (in `localStorage`) do. Only the Folio layer is written to disk; the device layer never leaves the machine. Switching the toggle repaints immediately, and the Folio's settings are untouched by whatever the device chose.
- **Live preview with no second source of truth.** An edited token is written to `:root` as a custom property; a reset *removes* it rather than writing a default back, so `tokens.css` stays the only place the defaults live. This is also why "Reset" shows the ADR's own colour rather than an empty value.
- **Contrast as you edit.** Text tokens carry a live WCAG ratio against the background, using the same formula as `scripts/contrast-report.mjs` — a unit test pins one pair to the number the generated report already publishes, so the screen and the report can never disagree.
- **Type:** editor face, interface face, measure (45–100 characters), leading and paragraph spacing. The editor stylesheet reads `--aml-measure`, `--aml-leading` and `--aml-paragraph-spacing` with its own values as the fallback, so the defaults still live in one place.
- **Bundled faces:** Source Serif 4, Literata, EB Garamond and IBM Plex Mono are fetched by `pnpm fonts:fetch` into `public/fonts/` and are **not committed** — the same arrangement as the Syncthing sidecar, and CI runs it before building. All four are SIL OFL 1.1, and the licence is downloaded beside each file, which is what that licence asks of an application that ships them. Together they are ~3.1 MB against the 90 MB installer budget. A missing file simply falls through to the next family in the stack.
- **Dependencies:** none added (fonts are assets, not packages).

## Acceptance criteria
- [x] The config file round-trips through nested YAML one setting per line, keeps settings this version does not understand, reads a hand-written file, and survives a save without losing the Folio's `version`/`name` (Rust tests `config.rs`).
- [x] Editing writes to the Folio layer or the device layer, clearing a token removes it, and `applyAppearance` writes only what is set (unit tests `features/appearance/store.test.ts`).
- [x] Contrast matches `docs/qa/contrast-report.md` to two decimal places and refuses to guess at non-hex input (unit test).
- [x] E2E: a colour previews instantly, survives a reload, and resets to ADR-010's own; contrast calls out a poor choice; measure and face apply to the page; the device override keeps edits local and leaves the Folio's alone (`e2e/appearance.spec.ts`).
- [x] The four bundled faces load in the running app (checked with `document.fonts.check`).
- [ ] **Gate 3:** change three colours in dark mode, restart on the other machine, and see them arrive via the Folio (`docs/qa/stage-3.md` §5). This is the acceptance that needs the PC.
- [ ] Ink palette approval on screen, outstanding since Gate 0 (`docs/qa/stage-0.md`).

## Lessons recorded
- A React-controlled `<input>` ignores a `value` set directly in `page.evaluate`; Playwright's `fill()` drives it properly, colour inputs included. This is the second time that has cost a debugging round — the first was the Command Palette in WP-2.7.
- The dev mock kept appearance in a module variable, so nothing survived a reload and the "saved to the Folio" test could not pass. Mocks standing in for a *file* have to persist like one; this one now uses `localStorage`, with a comment saying why.

## Not in this work package
- Per-token editing of anything outside ADR-010's seven colours, and a third mode: the ADR says two modes and no user CSS.
- Enumerating the machine's installed fonts (`queryLocalFonts` needs a permission prompt and is Chromium-only); the picker offers the approved faces and the common system families, and any other name typed into the config file is honoured.
