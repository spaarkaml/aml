# Changelog

All notable changes. Format: one entry per work package.

## Unreleased

### WP-1.3 — Images, tables, footnotes, properties (2026-09-10)
- Assets: `asset_write` / `asset_import` / `asset_resolve` commands; per-top-level-folder `assets/`; asset protocol scoped to the Folio; paste/drop images into the editor; `AmlImage` node view.
- Table toolbar (rows/cols/header/delete) and "Insert Table"; "Insert Footnote" (⌘⌥F).
- Properties panel: typed front-matter fields, add/remove, YAML mode; edits go through the guarded front-matter node.
- Editor stability: content frozen at creation per note version; focus after mount; palette commands run after the palette closes.

### WP-1.2 — Editor spike (2026-09-09)
- `src/lib/markdown`: remark-based parse, canonical serialiser with conservative escaping, AML inline syntax, mdast⇄ProseMirror bridge with verbatim Raw nodes. 48-file corpus AST-equal + idempotent.
- Tiptap 3 editor with AML nodes (front matter, raw block/inline, wiki link/embed, tag, cite, footnotes), list `spread`, code `meta`, table `align`.
- Editor store: open, debounced autosave with mtime conflict detection, external-change handling, word count; status bar shows words, reading time, save state.
- Front matter guard plugin; Playwright suite limited to 2 workers for keystroke stability.

### WP-1.1 — Folio basics (2026-09-09)
- Rust `folio` module: create/open, path-safe resolve, tree, read (BOM-stripped), atomic write with mtime conflict check, create/rename/trash, debounced watcher → `FolioChanged`.
- Commands + typed errors exported to TS; native folder picker via tauri-plugin-dialog.
- Welcome screen (open/create/recent, "Make it a Folio"), read-only tree in the Browser, breadcrumb shows the Folio.

### WP-0.4 — Design tokens & contrast (2026-09-09)
- `scripts/contrast-report.mjs` generates `docs/qa/contrast-report.md`; all text pairings ≥ 6.2:1 in both modes.

### WP-0.5 — App shell (2026-09-09)
- Top bar (wordmark, breadcrumb, tab strip placeholder, mode/layout/palette buttons), status bar.
- Side panels: pinned or slide-over, resizable, Escape/backdrop closes overlays.
- Layout store (Desk/Page presets, persisted per device), appearance store (Auto/Paper/Ink).
- Command registry with shortcut grammar, Command Palette with fuzzy search, global shortcut hook.

### WP-0.6 — Test infrastructure (2026-09-09)
- 48-file round-trip corpus with `manifest.json` (lossless / canonicalised / raw expectations) and a guard test.
- Playwright e2e in Chromium against Vite with mocked Tauri IPC (`src/dev-mocks.ts`); 6 shell specs.

### WP-0.2 — Repository scaffold (2026-09-09)
- Tauri 2.11 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vite 8, pnpm.
- Rust ↔ TS bridge via tauri-specta; `cargo test` regenerates `src/ipc/bindings.ts`.
- Biome lint/format, Vitest + Testing Library, `scripts/check-vocabulary.mjs`.
- Design tokens for Paper and Ink modes in `src/app/tokens.css` (ADR-010).
- First command `app_info`; "Hello Folio" window.

### WP-0.3 — CI (2026-09-09)
- GitHub Actions matrix (macOS, Windows): fmt, clippy, cargo test, bindings-current check, typecheck, lint, vocabulary, unit tests, frontend build, unsigned bundle upload.
