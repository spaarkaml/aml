# Changelog

All notable changes. Format: one entry per work package.

## Unreleased

### WP-2.3 — Backlinks and unlinked mentions (2026-09-10)
- Context panel (right side, ⌘⇧I) now holds Properties and Backlinks: linked mentions with line, context and section (click to jump), unlinked mentions with *Link* / *Link all*.
- Commands `backlinks` / `unlinked_mentions` / `link_mention_apply`; palette **Show Backlinks**.
- Index status polling ignores stale answers (fixes a rebuild-progress race).

### WP-2.2 — Links (2026-09-10)
- `[[` note picker in the editor (titles, aliases, `#` headings, "link to new note"); click a wiki link or a `.md` link to open it, or create the note when it does not exist; links that point nowhere are dashed.
- Rename propagation: renaming or moving a note or folder previews every link that would change and rewrites them after the move; **Undo Last Rename** in the palette.
- Commands `link_resolve` / `link_rename_preview` / `link_rename_apply` on the SQLite index.

### WP-2.1 — Index (2026-09-10)
- SQLite FTS5 index per Folio in local app-data (`src-tauri/src/index/`): notes, aliases, headings, tags, links, front-matter properties and full text; built on a thread with progress, kept current by the watcher, `Rebuild Index` in the palette; 5,000 notes in under a second.
- Commands `index_status` / `index_rebuild` / `index_search`; event `index-progress`; `folio_index` (Quick Open) now reads from SQLite.
- Status bar shows `Indexing n / total` while a build runs.

### WP-1.1b — Syncthing sidecar (2026-09-10)
- Bundled Syncthing (pinned v2.1.5, fetched by `pnpm sidecar:fetch`) managed by `sidecar::syncthing`: start on launch when enabled, stop on exit, LAN-only defaults.
- NAS sync screen: turn on, show/copy Device ID, add the NAS, accept offered folders into a chosen local folder and open them as a Folio, or share the open Folio; sync log.
- Status bar shows sync state for the open Folio.

### WP-1.7 — Australian English spell check (2026-09-10)
- Bundled SCOWL en_AU Hunspell dictionary checked in Rust (`spellbook`); commands `spell_check` / `spell_suggest` / `spell_add` / `spell_ignore`.
- Wavy underlines in the editor with a right-click menu (suggestions, add to `.aml/dictionary.txt`, ignore); code, links, front matter, atoms and acronyms are skipped.
- Status-bar toggle and palette command; setting persisted per device.

### WP-1.4 — Editor ergonomics (2026-09-10)
- Auto-pair for brackets and quotes (skip-over, Backspace clears a pair, wrap or toggle marks on a selection); `[[Note]]` becomes a link while typing.
- `/` block menu (headings, lists, quote, code, table, divider, footnote, note link, date).
- Floating formatting toolbar on selection (bold, italic, strike, code, link, H1–H3).
- E2E helpers that wait for ProseMirror to adopt a mouse-placed caret.

### WP-1.6 — Quick Open (2026-09-10)
- ⌘O Quick Open: fuzzy over titles, front-matter aliases, headings and paths; recents on an empty query; heading match jumps to the heading; "Create note" for unmatched queries.
- Rust `folio_index` command with an mtime-cached in-memory index (`folio/index.rs`).

### WP-1.5 — Folio Browser, tabs and navigation (2026-09-10)
- Tabs per Folio (persisted per device), back/forward history, breadcrumb with reveal-in-Browser; ⌘W / ⌘⌥→← / ⌘[ ] / ⌘1–9.
- Folio Browser: `+ Note` / `+ Folder`, context menu, inline rename, drag-move, OS-trash with confirm, persisted expanded folders, unsaved badge.
- New Note ⌘N, Rename Note F2, Move Note to Trash…, Reveal Note in Browser.
- Editor ignores the watcher echo of its own saves (no more remount after autosave); follows renamed files.
- macOS menu bar without "Close Window" so ⌘W closes a tab.

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
