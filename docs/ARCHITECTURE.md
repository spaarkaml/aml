# AML — Architecture (living document)

Updated with every work package. If this file and the code disagree, the code is wrong or this file is stale — fix one in the same PR.

## Process model

```
┌──────────────── Tauri app (one process) ────────────────┐
│  Rust core (src-tauri)            Webview (src)          │
│  ─────────────────────            ──────────────         │
│  commands::*  ── tauri-specta ──▶ src/ipc/bindings.ts   │
│  (fs, index, snapshots,           React 19 + Zustand     │
│   sidecars, watch)                features/*             │
│                                                          │
│  sidecars (Stage 1+): syncthing · pandoc · typst         │
└──────────────────────────────────────────────────────────┘
```

- **Rule:** the webview never touches disk, network or child processes. Every capability is a Rust command registered in `src-tauri/src/lib.rs::specta_builder`.
- **Bindings:** `cargo test` regenerates `src/ipc/bindings.ts`; it is committed; CI fails if stale. TypeScript imports only from `@/ipc`.

## Repository map

| Path | Owns |
|---|---|
| `src-tauri/src/lib.rs` | App bootstrap, plugin registration, command registry |
| `src-tauri/src/commands/<domain>.rs` | One file per command domain (`app`, `folio`, `index`, `spell`, `sync`; later `snapshots`, `compile`) |
| `src-tauri/src/folio/` | Folio model, path safety, atomic writes (`mod.rs`), watcher (`watch.rs`), errors |
| `src-tauri/src/boundings.rs` | Boundings (ADR-011) in `.aml/boundings.yaml`, one note per line; Project discovery for the Overview |
| `src-tauri/src/templates.rs` | Templates and Daily notes (WP-2.7): placeholder rendering, civil-date arithmetic, `_templates/` listing, `journal/` scanning |
| `src-tauri/src/index/` | SQLite FTS5 index (ADR-007): `extract.rs` (note facts from markdown), `mod.rs` (schema, build/refresh, watcher updates, Quick Open entries, search), `links.rs` (link resolution, rename preview/apply), `backlinks.rs` (backlinks, unlinked mentions, link a mention), `tags.rs` (tag/note pairs), `search.rs` (query language: parse, evaluate, snippet) |
| `src-tauri/src/sidecar/` | `syncthing.rs`, the only module that touches the Syncthing binary |
| `src-tauri/src/spell.rs` | Hunspell en_AU checker |
| `src-tauri/src/state.rs` | `AppState { folio, watcher, index, speller, syncthing }` managed by Tauri |
| `src/app/` | `App.tsx`, `commands.ts` (shell commands + `SHORTCUTS` table), `tokens.css`, `global.css`, `shell/` (Shell, TopBar, SidePanel, StatusBar) |
| `src/features/<feature>/` | Feature folders: components, store, tests. Current: `commands`, `layout`, `appearance`, `folio` (store, Welcome, FolioTree, watcher events), `editor` (Tiptap extensions in `extensions/` incl. `autopair.ts` and `slash.ts`, `NoteEditor.tsx`, `SlashMenu.tsx` + `slashStore.ts`, `SelectionToolbar.tsx`, store with debounced save/conflicts, `editorRef.ts`, `assets.ts`/`paste.ts` for images, `TableMenu.tsx`, `footnotes.ts`), `properties` (front-matter panel + `frontmatter.ts` helpers), `tabs` (per-Folio tab store with recents, `useTabsSync`, `TabStrip`, `Breadcrumb`), `quickopen` (index store, ranking in `search.ts`, `QuickOpen.tsx`), `spell` (tokeniser, store, `SpellMenu.tsx`; the ProseMirror plugin lives in `editor/extensions/spell.ts`), `sync` (status polling store, `SyncScreen.tsx`), `index` (build progress store, status-bar label), `links` (resolution cache + `[[` picker state + rename dialog + `backlinksStore`/`BacklinksPanel`; the ProseMirror plugins live in `editor/extensions/links.ts` and `linkmenu.ts`). The right panel is `app/shell/ContextPanel.tsx` (Outline + Properties + Backlinks sections); the left panel is `app/shell/LeftPanel.tsx` (Folio Browser / Tags / Search / Daily / Boundings switch; which view it shows is layout state). `outline` holds `outline.ts` (heading tree and section moves over a structural `DocLike`), the store and `OutlinePanel.tsx`; the plugin that feeds it is `editor/extensions/outline.ts`. `boundings` holds the store (list, draft, selection) and `BoundingsPanel.tsx`; `overview` holds the home screen shown when no note is open. `daily` holds `dates.ts` (local civil dates), the store and `DailyPanel.tsx`; `templates` holds the store that lists `_templates/` and registers a palette command per template. `search` holds the query store (debounced, generation-guarded), `terms.ts` (the text terms of a query, for replace-in-note) and `SearchPanel.tsx`. `tags` holds the store (entries, view, expanded, selected; persisted `aml.tags`), `tree.ts` and `TagsPanel.tsx`; the chip-click plugin is `editor/extensions/tags.ts`. `folio` also holds `browserStore.ts` (expanded folders, inline rename target), `ContextMenu.tsx` and `errors.ts`. Cross-feature imports are limited to stores and `src/lib` |
| `src/lib/markdown/` | The markdown bridge: `mdast.ts` (parse + canonical serialise), `escape.ts`, `inline-syntax.ts` (wiki/tag/cite), `pm.ts` (mdast ⇄ ProseMirror JSON, Raw nodes), `index.ts` API |
| `src/lib/` | `fuzzy.ts`, `platform.ts`, `wordcount.ts` |
| `src/ipc/` | Generated bindings + `index.ts` re-export |
| `themes/` | Reserved for Book Designs' CSS previews; app colours live in `tokens.css` |
| `test-corpus/` | Round-trip markdown corpus, 48 files in 6 categories, `manifest.json` declares expectations |
| `e2e/` | Playwright specs run in Chromium against Vite with mocked IPC (`src/dev-mocks.ts`); tauri-driver has no macOS support |
| `scripts/` | `check-vocabulary.mjs`, `contrast-report.mjs` |

## Commands (current)

| Command | Args | Returns | Domain |
|---|---|---|---|
| `app_info` | — | `AppInfo` | app |
| `folio_open` | path | `FolioInfo` | folio |
| `folio_create` | path, name? | `FolioInfo` | folio |
| `folio_close` / `folio_current` / `folio_recent` | — | — / `FolioInfo?` / `RecentFolio[]` | folio |
| `folio_tree` | — | `TreeNode[]` | folio |
| `folio_index` | — | `NoteIndexEntry[] { path, title, aliases, headings, mtime }` from SQLite | index |
| `index_status` | — | `IndexStatus { notes, building, done, total, lastBuilt, lastDurationMs }` | index |
| `index_rebuild` | — | — (runs on a thread; progress by event) | index |
| `index_search` | query, limit? | `SearchHit[] { path, title, snippet }` (FTS5, bm25) | index |
| `link_resolve` | from, links[{target, kind}] | `(path \| null)[]` | links |
| `link_rename_preview` | from, to | `RenamePreview { notes[{path, newPath, edits[{line, before, after}]}], links }` | links |
| `link_rename_apply` | notes (from a preview) | lines rewritten | links |
| `backlinks` | path | `Backlink[] { source, sourceTitle, line, context, section?, kind }` | links |
| `unlinked_mentions` | path | `Mention[] { source, sourceTitle, line, context, matched, section? }` | links |
| `link_mention_apply` | source, line, matched, target | true if rewritten | links |
| `tags_list` | — | `TagEntry[] { tag, path, title }` (distinct pairs) | tags |
| `tag_notes` | tag | paths carrying the tag or a nested one | tags |
| `boundings_list` | — | `Bounding[] { id, name, colour, icon, notes }` | boundings |
| `bounding_create` / `bounding_update` / `bounding_delete` | name / id + fields / id | the Bounding, or the new list | boundings |
| `bounding_add` / `bounding_remove` | id, paths | the new list | boundings |
| `projects_list` | — | `ProjectInfo[] { path, name, notes }` (folders with `project.aml.yaml`) | boundings |
| `templates_list` | — | `TemplateInfo[] { name, path, noteType? }` | templates |
| `note_from_template` | path, template, vars { title, date, time } | `NoteMeta` (AlreadyExists if the note is there) | templates |
| `daily_note` | date (`YYYY-MM-DD`), time (`HH:MM`) | `DailyNote { path, created }` | templates |
| `daily_dates` | — | dates that have a Daily, newest first | templates |
| `search_query` | query, limit? | `SearchResponse { results[{path, title, matches, snippets[{line, text, section?}]}], total, error? }` | search |
| `note_read` | path | `NoteContent { path, text, mtime, size }` | folio |
| `note_write` | path, text, expectedMtime? | `NoteMeta` (Conflict error if mtime moved) | folio |
| `entry_create_note` / `entry_create_folder` / `entry_rename` / `entry_trash` | paths | — | folio |
| `asset_write` | notePath, fileName, dataBase64 | `AssetInfo { path, markdownPath, absolute, size }` | folio |
| `asset_import` | notePath, source (absolute) | `AssetInfo` | folio |
| `asset_resolve` | notePath, target | absolute path (for `convertFileSrc`) | folio |
| `spell_check` / `spell_suggest` / `spell_add` / `spell_ignore` | words / word | misspelled subset / suggestions / — / — | spell |
| `sync_status` / `sync_enable` / `sync_disable` / `sync_add_device` / `sync_remove_device` / `sync_accept_folder` / `sync_share_folder` / `sync_is_synced_path` / `sync_log_tail` | see spec WP-1.1b | `SyncStatus` | sync |

Events: `folio-changed` → `FolioChanged { paths }` (debounced watcher, emitted after the index has applied the change); `index-progress` → `IndexProgress { done, total }` during builds.

All results are `{status:"ok",data}|{status:"error",error:FolioError}`; `FolioError` is `{kind, detail}`.

## Data on disk

- **Folio:** `<root>/.aml/config.yaml`, `<root>/.aml/snapshots/`, `<root>/.stignore` (created by `Folio::create`). Everything else in the root is user content; dotfiles, `node_modules` and `.aml-tmp-*` are invisible to the tree.
- **Per device (app-data dir):** `recent-folios.json`, `index/<hash>.sqlite` (one per Folio, rebuildable, safe to delete), `syncthing/` (sidecar home), `sync-settings.json`. Layout/appearance in webview localStorage.
- **Writes** always go through `folio::write_atomic` (temp + fsync + rename).
- **Assets:** `<top-level folder>/assets/YYYYMMDD-HHMMSS-<slug>.<ext>`; notes reference them relatively; displayed via the Tauri asset protocol (scope = Folio root, set on open).

## Quality tooling

`pnpm check` = typecheck → Biome → Vitest → vocabulary grep → clippy `-D warnings` → `cargo test`. Vitest allows 20 s per test: the hosted Windows runner needs ~10 s to render the shell in jsdom. CI runs the same on macOS and Windows plus an unsigned bundle build.

## Shell model (WP-0.5)

- **Panels:** `left` (Folio Browser, Tags, Search, Daily or Boundings view) and `right` (Context: Outline + Properties + Backlinks sections). Each is closed, open-as-overlay, or pinned. Overlay closes on Escape or backdrop click; pinned takes layout space and is resizable.
- **Layouts:** `desk` (Browser pinned) and `page` (nothing pinned). Persisted per device in localStorage key `aml.layout`.
- **Commands:** everything user-triggerable registers in `commandRegistry` with an optional default shortcut (`mod+shift+e` grammar). `useGlobalShortcuts` binds them; `CommandPalette` lists them; `ShortcutsDialog` (⌘/) rebinds them. The registry holds per-device overrides (`aml.keymap`, `features/commands/keymapStore.ts`) and `shortcutOf` is the single answer to "what key runs this" — the palette, the top bar and the key handler all ask it. Defaults live in `src/app/commands.ts`; `e2e/shortcuts.spec.ts` presses every bound shortcut and checks which command ran, using the dev-only `__amlCommands` / `__amlLastCommand` globals. Editor formatting keys (⌘B and friends) remain Tiptap's: ProseMirror sees a key press before it reaches the window listener, so one owner per key means leaving those alone for now.
- **Blocks:** `features/editor/blocks.ts` is the one list of block actions; the `/` menu and the palette's `Format` commands both read it.
- **Appearance:** `aml.appearance` setting `system|paper|ink` → `<html data-mode>`; tokens in `tokens.css`.

## Navigation model (WP-1.5)

- One editor instance; the **active tab** decides what it shows. `useTabsSync` (mounted in `App`) maps Folio root → tabs store and active tab → `useEditorStore.open`; a missing note closes its tab.
- Tabs and expanded Browser folders are per Folio and per device (`aml.tabs`, `aml.browser` in localStorage). Back/forward stacks are session-only.
- Entry operations (create / rename / move / trash) live in `useFolioStore` and fan out to the editor (`renamed`), tabs (`rename`, `closeWithin`) and Browser state before refreshing the tree from Rust. Trash is always the OS trash, behind a native confirm.
- Quick Open (⌘O) searches `folio_index` in memory (`quickopen/search.ts`); the index is refreshed on Folio open and after each `FolioChanged`.
- The watcher echoes the app's own writes; the editor ignores a `FolioChanged` for its note while a save is in flight or when the on-disk mtime equals the one it holds.

## Index (WP-2.1)

- One SQLite file per Folio (`index::db_path_for`), opened with the Folio and refreshed on a thread; `AppState.index` holds the query handle, builds use `Index::for_thread()` on the same file (WAL) and share `Progress` atomics.
- Tables `notes / aliases / headings / tags / links / props` (cascade on delete) + FTS5 `notes_fts(title, body)`. `notes.stem` and `links.key` are lower-case file stems: backlinks and rename propagation are a join.
- The watcher calls `commands::index::apply_changes(paths)` before emitting `FolioChanged`; a rebuild is `DELETE` + `refresh`. Everything is derived: deleting the file rebuilds on next open.
- `extract.rs` is the single markdown fact-extractor for Rust (front matter, headings, tags, links, body, words); it is line-based and never fails. Links carry the byte span of their target so a rename can rewrite exactly that.

## Boundings and the Overview (WP-2.8)

- `.aml/boundings.yaml` is **authored** state, so it lives in the Folio (unlike the index, which is derived and per-device). It is written one note per line so two devices adding notes to the same Bounding merge cleanly — that line shape is why the module writes its own strict YAML subset instead of using a library.
- A Bounding's `id` is a slug fixed at creation; the panel therefore only creates one once it has a real name. Membership is a list of paths, so `entry_rename` and `entry_trash` remap and prune it.
- `bounding:` searches read the file per query and pass the names into each `Doc`; no index table, because the data is not derived from note content.
- The Overview is the home screen when no note is open, and composes existing stores (Boundings, Dailies, tabs' recents) rather than adding state of its own.

## Templates and Daily notes (WP-2.7)

- Placeholders are expanded in Rust; **the frontend owns "now"** (only it knows the device's timezone) and passes `YYYY-MM-DD` plus `HH:MM`, so `templates::render` is pure civil-date arithmetic and fully testable. Unknown placeholders are left verbatim, like Raw nodes.
- Dailies are written to `journal/YYYY/YYYY-MM-DD.md` and read from there or a flat `journal/YYYY-MM-DD.md`; an existing Daily is opened, never overwritten.
- Templates register palette commands from the Folio's own files (`commandRegistry.register` returns an unregister function); WP-3.3's "New <Type>" commands will reuse this.

## Outline (WP-2.6)

- The outline is derived from the **live ProseMirror document**, never the index: it must follow unsaved edits. `features/outline/outline.ts` works over a structural `DocLike` so it unit-tests without an editor.
- A section is a top-level heading plus everything after it up to the next heading of the same or a higher level; reordering is one `delete` + `insert` transaction, so it saves and undoes like any other edit.
- The store holds no document positions (they move on every keystroke) and only re-renders when a heading actually changes; `jump`/`move` re-read positions from the live editor. It also records which editor view owns the outline, because switching notes mounts the new view before destroying the old one.

## Search (WP-2.5)

- `index/search.rs` is the only place a query is parsed or run: `parse` → `Expr` of `Term::{Word, Phrase, Regex, Field}`, evaluated against a `Doc` read from disk. Required word/phrase terms become an FTS5 `MATCH` pre-filter; the exact evaluation then happens on the file, so results never disagree with what is on disk.
- Only a bad regex is an error; any other shape parses to something that simply matches less, so the panel can search while the user types.
- Snippets carry the current heading as `section` and wrap hits in `«»` (never written to a file); the panel renders them as `<mark>`.
- `features/search/terms.ts` mirrors the tokenizer's *shape* in TypeScript to find the same text in the open editor for replace-in-note. It evaluates nothing — if the two ever disagree, Rust is right.

## Links (WP-2.2)

- Resolution lives in Rust only (`Index::resolve`): `.md` links relative to the note, wiki targets by path suffix → stem (same folder first) → title → alias. The editor batches `link_resolve` per document change and paints `.aml-link-missing`.
- `useFolioStore.rename` = preview (`link_rename_preview`) → dialog when links are affected → `entry_rename` → `link_rename_apply` → invalidate the resolution cache. Apply is line-exact and skips lines that changed since the preview.
- The `[[` picker reads Quick Open's entries; it never talks to Rust while typing.
- Backlinks (WP-2.3) are `links` rows that `Index::resolve` maps to the note; unlinked mentions are FTS phrase hits re-scanned line by line outside links. `BacklinksPanel` reloads on note change and on the link cache version bump (`folio-changed`).

## Syncthing sidecar (WP-1.1b)

- `src-tauri/src/sidecar/syncthing.rs` is the only module that touches the bundled `syncthing` binary: spawn with `--home <app-data>/syncthing --gui-address 127.0.0.1:41384 --gui-apikey …`, REST via `ureq`, LAN-only options patched on every start, stop on `RunEvent::Exit`.
- The binary comes from `scripts/fetch-syncthing.mjs` (pinned version, sha256-checked) into `src-tauri/binaries/` (gitignored) and ships via `bundle.externalBin`.
- The UI polls `sync_status` every 5 s while a Folio or the sync screen is open.

## Spell check (WP-1.7)

- Rust `spell.rs` embeds the SCOWL en_AU Hunspell dictionary and checks words with `spellbook`; personal words live in `.aml/dictionary.txt` (synced), session ignores in memory.
- The editor plugin (`extensions/spell.ts`) tokenises the document (`features/spell/tokenise.ts`), asks Rust about unseen words, and paints `.aml-misspelled` decorations; right-click opens suggestions.

## Editor data flow (WP-1.2)

```
disk ──note_read──▶ text ──markdownToDoc──▶ PM JSON ──setContent──▶ Tiptap
Tiptap ──onUpdate──▶ store.changed(doc) ──debounce 1 s──▶ docToMarkdown ──note_write(expectedMtime)──▶ disk
```
- `store.doc` is always the latest document; `docVersion` bumps only on load/reload so the editor reloads content only then.
- Conflict (mtime moved) or watcher change while dirty → banner: Reload from disk / Keep mine.
- Word count from PM JSON (`lib/wordcount.ts`), shown in the status bar.
- Front matter node is guarded by a ProseMirror plugin: it cannot be removed by editing.
