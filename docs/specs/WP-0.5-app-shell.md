# WP-0.5 — App shell
**Stage:** 0 · **Depends on:** 0.2 · **ADRs:** 002, 004, 010 · **Sessions:** 1

## Goal
The window frame every later feature slots into: top bar with breadcrumb and tab strip, left/right panels that slide over or pin, Desk/Page Layouts, a Command Palette and a single shortcut table.

## Acceptance criteria
- [x] Panels open as overlays; pin keeps them; Escape/backdrop closes overlays; width is draggable and clamped.
- [x] Desk/Page toggle (⌘/Ctrl+Shift+L) and per-device persistence.
- [x] Palette (⌘/Ctrl+K): fuzzy filter, arrow keys, Enter runs, Escape closes; shows shortcuts.
- [x] Appearance Auto/Paper/Ink (⌘/Ctrl+Shift+M) applied to `<html data-mode>`.
- [x] Every shortcut in `SHORTCUTS` has an e2e assertion.

## Tests
Unit: registry, fuzzy, layout store, appearance store, palette, App shell. E2E: `e2e/shell.spec.ts`.
