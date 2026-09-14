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
| `src-tauri/src/commands/<domain>.rs` | One file per command domain (`app`, `folio`, `index`, `spell`, `sync`, `project`, `update`, `conflicts`, `snapshots`; later `compile`) |
| `src-tauri/src/folio/` | Folio model, path safety, atomic writes (`mod.rs`), watcher (`watch.rs`), errors |
| `src-tauri/src/note_types.rs` | Note Types (Q9): `.aml/types.yaml`, one field per line, holding only what has been customised. Types are discovered from `_templates/`, from the index and from that file; a type's default colour is a hash of its id over the ADR-010 palette, and its fields are its template's front-matter keys |
| `src-tauri/src/config.rs` | The Folio's `.aml/config.yaml` (ADR-010): settings as dotted paths, written back as nested YAML one per line, keeping anything this version does not know. `Appearance` and `Preferences` are two views onto the one file |
| `src-tauri/src/boundings.rs` | Boundings (ADR-011) in `.aml/boundings.yaml`, one note per line |
| `src-tauri/src/project.rs` | Projects (ADR-004, ADR-011): `project.aml.yaml` — title, goal, Binder order, compile exclusions — one item per line, unknown top-level blocks kept verbatim; the Binder reconciled against the folder on every read; Project discovery for the Overview |
| `src-tauri/src/front_matter.rs` | Editing a note's YAML front matter one line at a time, for cards written onto notes that are not open |
| `src-tauri/src/update.rs` | What AML knows about its own updates (ADR-012): the error type the update screen shows, what a plugin error actually means (a refused signature is never a network problem), and the progress throttle. The `Pending` slot holds the update `update_check` found for `update_install` |
| `src-tauri/src/conflicts.rs` | Sync conflicts (WP-4.2): recognising Syncthing's `*.sync-conflict-*` names, listing copies across the Folio **including `.aml/`**, reading both sides, and resolving one — the whole text through `write_atomic`, everything given up to the Trash, refused if the original's mtime moved. `locate` refuses any path that is not a conflict copy, which is why this module alone may write into `.aml/` |
| `src-tauri/src/snapshots.rs` | Snapshots (ADR-006, WP-4.1): `.aml/snapshots/<note>/<UTC stamp>[-label].md`, written once, never edited. The automatic rule (`before_write`, run inside `Folio::write_note` and before link rewrites), labelled keeps before a restore or a conflict resolution (`keep_before`), byte-identical restore, history moved with a rename (`move_history`), retention (`to_prune`, pure) and usage |
| `src-tauri/src/templates.rs` | Templates and Daily notes (WP-2.7): placeholder rendering, civil-date arithmetic, `_templates/` listing, `journal/` scanning |
| `src-tauri/src/index/` | SQLite FTS5 index (ADR-007): `extract.rs` (note facts from markdown), `mod.rs` (schema, build/refresh, watcher updates, Quick Open entries, search), `links.rs` (link resolution, rename preview/apply), `backlinks.rs` (backlinks, unlinked mentions, link a mention), `tags.rs` (tag/note pairs), `projects.rs` (one query for a Project's word counts and card properties), `graph.rs` (the link graph: every link resolved once through `Index::resolve`, memoised, repeats collapsed into a weighted edge; Boundings as clusters), `search.rs` (query language: parse, evaluate, snippet) |
| `src-tauri/src/sidecar/` | `syncthing.rs`, the only module that touches the Syncthing binary |
| `src-tauri/src/spell.rs` | Hunspell en_AU checker |
| `src-tauri/src/state.rs` | `AppState { folio, watcher, index, speller, syncthing }` managed by Tauri; `update::Pending` is managed alongside it |
| `src/app/` | `App.tsx`, `commands.ts` (shell commands + `SHORTCUTS` table), `tokens.css` (ADR-010 colours + the whole ADR-013 foundation: type ramp, spacing, radii, elevation, motion), `global.css` (reduced-motion reset, focus rings, scrollbars, `@font-face`), `icons.tsx` (the drawn 16px interface icon set), `tokens.test.ts` (stylesheet lint: no stylesheet names a colour, radius or font size of its own), `shell/` (Shell, TopBar, SidePanel, StatusBar) |
| `src/features/<feature>/` | Feature folders: components, store, tests. Current: `commands`, `layout`, `appearance`, `folio` (store, Welcome, FolioTree, watcher events), `editor` (Tiptap extensions in `extensions/` incl. `autopair.ts` and `slash.ts`, `NoteEditor.tsx`, `SlashMenu.tsx` + `slashStore.ts`, `SelectionToolbar.tsx`, store with debounced save/conflicts, `editorRef.ts`, `assets.ts`/`paste.ts` for images, `TableMenu.tsx`, `footnotes.ts`), `properties` (front-matter panel, `frontmatter.ts` helpers and `edit.ts` — the one way anything writes a note's front matter, shared with Goals), `tabs` (per-Folio tab store with recents, `useTabsSync`, `TabStrip`, `Breadcrumb`), `quickopen` (index store, ranking in `search.ts`, `QuickOpen.tsx`), `spell` (tokeniser, store, `SpellMenu.tsx`; the ProseMirror plugin lives in `editor/extensions/spell.ts`), `sync` (status polling store with the connection phases the status bar shows, `SyncScreen.tsx`), `index` (build progress store, status-bar label), `links` (resolution cache + `[[` picker state + rename dialog + `backlinksStore`/`BacklinksPanel`; the ProseMirror plugins live in `editor/extensions/links.ts` and `linkmenu.ts`). The right panel is `app/shell/ContextPanel.tsx` (Outline + Properties + Backlinks sections); the left panel is `app/shell/LeftPanel.tsx` (a three-way Folio Browser / Boundings / Search switch — which view it shows is layout state — with the Tags panel composed under Search and the Daily strip as the sticky tray under the tree). `outline` holds `outline.ts` (heading tree and section moves over a structural `DocLike`), the store and `OutlinePanel.tsx`; the plugin that feeds it is `editor/extensions/outline.ts`. `boundings` holds the store (list, draft, selection), `BoundingsPanel.tsx` and `BoundingPrompt.tsx` (the floating offer shown over a note that is in no Bounding); `overview` holds the home screen shown when no note is open. `appearance` holds the mode and colour store (Folio layer plus a per-device override), `tokens.ts` (the ADR-010 tokens, fonts and contrast maths) and `AppearanceScreen.tsx`. `writing` holds the per-device writing modes (`store.ts`) and `sentences.ts` (sentence boundaries for Focus); its ProseMirror plugin is `editor/extensions/writing.ts`, and Zen is rendered by `app/shell/Shell.tsx`. `daily` holds `dates.ts` (local civil dates), the store and `DailyPanel.tsx` (the week and today's note, in the Browser's tray); `stats` holds `stats.ts` (the figures, readability and per-section word counts, all pure and counting exactly what `lib/wordcount.ts` counts) and `StatsScreen.tsx`, opened from the status bar's word count; `goals` holds the goal arithmetic (`goals.ts` — a note's target from its front matter, progress, days left, pace and streaks, all pure and tested), the per-device tally store, `useGoals.ts` (the subscription that turns word-count changes into words written), `ProgressRing.tsx` and `GoalsSection.tsx`; `types` holds the Note Type store (the registry plus `path → type`, with a debounced write), `TypeBadge.tsx` (the emoji or the coloured dot, used by the Browser and the Properties panel) and `TypesSettings.tsx`; `settings` holds the Folio-preferences store and `SettingsScreen.tsx` (⌘,, the Daily notes folder, and the way to Appearance / NAS Sync / shortcuts); `templates` holds the store that lists `_templates/` and registers a palette command per template. `search` holds the query store (debounced, generation-guarded), `terms.ts` (the text terms of a query, for replace-in-note) and `SearchPanel.tsx`. `tags` holds the store (entries, view, expanded, selected; persisted `aml.tags`), `tree.ts` and `TagsPanel.tsx`; the chip-click plugin is `editor/extensions/tags.ts`. `project` holds everything a book needs: `project.ts` (pure — parts and their documents, totals, status rows, card colours, and the drop/nest plans the Binder and the Corkboard share), `store.ts` (the list, which Project you are in — per device and per Folio — and every write), `BinderPanel.tsx` (which replaces the Folio tree in the Browser while a Project is open), `Corkboard.tsx`, `Dashboard.tsx`, `ProjectScreen.tsx` (the page the last two share) and `split.ts` (split at cursor). `graph` holds `layout.ts` (the force layout — repulsion on a grid, springs, Bounding gravity and Bounding separation, all pure and tested), the store (scope and depth per device), `GraphCanvas.tsx` (canvas 2D, reading its palette from `tokens.css`), `GraphScreen.tsx` (⌘⇧G) and `GraphPanel.tsx` (the open note's corner, in the Context panel). `history` holds the History screen (WP-4.1/3.5): `timeline.ts` (day headings, times, grouping — pure), the store (the note on disk, the list, the selected Snapshot and what it is compared with; it saves the editor before anything) and `HistoryScreen.tsx`, opened from *Saved* in the status bar, the editor's right-click menu and the palette; its diff is `conflicts/merge.ts`. `conflicts` holds `merge.ts` (a two-way line diff with the shared head and tail trimmed, word marks inside a changed paragraph, and composing a text from per-difference choices — pure and tested), the store (the list, the pair being compared — a set-aside copy or the editor's unsaved edits — and the choices) and `ConflictsScreen.tsx`; the status-bar chip and the note banner read the same list. `sync` also holds `SyncTroubleBanner.tsx`, and its store tracks per-folder progress to tell a stalled sync from a slow one. `diagram` holds the diagram editor (WP-7.1): `model.ts` (nodes, links, groups, the symbol set and the geometry of where a link meets a shape — pure), `shapes.ts` (outlines, line ends and arithmetic text wrapping, shared by the editor and the exported file), `format.ts` (the one-item-per-line model text, and reading it back out of an SVG's `<metadata>`), `DiagramBody.tsx` (the drawing itself), `export.ts` (that same tree through `renderToStaticMarkup`), `DiagramStage.tsx` (pan, zoom, select, drag, link and resize, all hit-tested on the root), `DiagramScreen.tsx` and the store (document, selection, undo stack and where it is being saved). `update` holds `update.ts` (version ordering, what a “Not now” means, progress arithmetic — all pure), the store (per-device, persisted `aml.update`) and `UpdateScreen.tsx`, opened from the version in the status bar. `folio` also holds `browserStore.ts` (expanded folders, inline rename target), `ContextMenu.tsx` and `errors.ts`. Cross-feature imports are limited to stores and `src/lib` |
| `src/lib/markdown/` | The markdown bridge: `mdast.ts` (parse + canonical serialise), `escape.ts`, `inline-syntax.ts` (wiki/tag/cite), `callout.ts` (Obsidian callouts read from and written as their own source lines, so head and body keep their shape), `pm.ts` (mdast ⇄ ProseMirror JSON, Raw nodes), `index.ts` API |
| `src/lib/` | `fuzzy.ts`, `platform.ts`, `wordcount.ts` |
| `src/ipc/` | Generated bindings + `index.ts` re-export |
| `themes/` | Reserved for Book Designs' CSS previews; app colours live in `tokens.css` |
| `test-corpus/` | Round-trip markdown corpus, 48 files in 6 categories, `manifest.json` declares expectations |
| `e2e/` | Playwright specs run in Chromium against Vite with mocked IPC (`src/dev-mocks.ts`); tauri-driver has no macOS support |
| `scripts/` | `check-vocabulary.mjs`, `contrast-report.mjs`, `version.mjs` (the one version, in three files), `latest-json.mjs` (the updater endpoint, built from the bundler's signatures), `icons.mjs` (`pnpm icons`: draws the app icon — the rounded stencil monogram, a white squircle for macOS and a bare light-blue glyph for Windows, with widened cuts at 32px and below — writes the SVG masters to `src-tauri/icons/source/` and renders every PNG, the `.ico` and the `.icns`) |

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
| `appearance_read` / `appearance_write` | — / appearance | `Appearance { mode?, uiFont?, editorFont?, measure?, leading?, paragraphSpacing?, paper, ink }` | config |
| `types_list` | — | every type with colour, icon, template, fields and notes count | note_types |
| `types_by_note` | — | `path → type id` for every typed note, from the index | note_types |
| `type_write` | type | saves a type's name/colour/icon (defaults are forgotten, not written); returns the list | note_types |
| `preferences_read` / `preferences_write` | — / preferences | `Preferences { dailyFolder?, dailyGoal?, snapshotKeepAllDays?, snapshotKeepDailyDays? }`; write returns what was stored, and refuses a folder outside the Folio | config |
| `boundings_list` | — | `Bounding[] { id, name, colour, icon, notes }` | boundings |
| `bounding_create` / `bounding_update` / `bounding_delete` | name / id + fields / id | the Bounding, or the new list | boundings |
| `bounding_add` / `bounding_remove` | id, paths | the new list | boundings |
| `projects_list` | — | `ProjectInfo[] { path, name, notes }` (folders with `project.aml.yaml`) | project |
| `project_read` | path | `Project { path, name, title, target?, deadline?, binder[] }`; `BinderItem { path, rel, name, kind, depth, include, words, synopsis, label, status }` | project |
| `project_create` | path, title | writes the manifest (creating the folder if needed) and returns the Project | project |
| `project_write` | path, title?, target?, deadline? | saves the manifest's own fields; returns the Project | project |
| `project_order` | path, order (project-relative) | the new Binder order; paths the folder does not hold are kept | project |
| `project_include` | path, item, include | adds to or removes from `exclude:` | project |
| `project_card_write` | path, note, synopsis?, label?, status? | writes them to the **note's** front matter; returns the Project with that row overlaid | project |
| `project_of_note` | path | the innermost Project folder above the note, or null | project |
| `templates_list` | — | `TemplateInfo[] { name, path, noteType? }` | templates |
| `note_from_template` | path, template, vars { title, date, time } | `NoteMeta` (AlreadyExists if the note is there) | templates |
| `daily_note` | date (`YYYY-MM-DD`), time (`HH:MM`) | `DailyNote { path, created }`, under the Folio's `daily.folder` (default `journal`) | templates |
| `daily_dates` | — | dates that have a Daily, newest first | templates |
| `search_query` | query, limit? | `SearchResponse { results[{path, title, matches, snippets[{line, text, section?}]}], total, error? }` | search |
| `note_read` | path | `NoteContent { path, text, mtime, size }` | folio |
| `note_write` | path, text, expectedMtime? | `NoteMeta` (Conflict error if mtime moved) | folio |
| `entry_create_note` / `entry_create_folder` / `entry_rename` / `entry_trash` | paths | — | folio |
| `asset_write` | notePath, fileName, dataBase64 | `AssetInfo { path, markdownPath, absolute, size }` | folio |
| `asset_import` | notePath, source (absolute) | `AssetInfo` | folio |
| `asset_resolve` | notePath, target | absolute path (for `convertFileSrc`) | folio |
| `asset_read_text` | notePath, target | the asset's text (a diagram's SVG) | folio |
| `asset_write_text` | notePath, target, text | — (overwrites that asset in place) | folio |
| `conflicts_list` | — | `Conflict[]` (newest first) | conflicts |
| `conflict_read` | path | `ConflictPair { conflict, originalText, copyText }` (text `null` when a side is missing or binary) | conflicts |
| `conflict_resolve` | path, resolution (`keepOriginal` / `keepCopy` / `merge` + text / `keepBoth`), expectedOriginalMtime | — (`conflict` if the original moved) | conflicts |
| `snapshots_list` | path | `Snapshot[] { id, taken (UTC ISO), label?, words, size }`, newest first | snapshots |
| `snapshot_read` | path, id | text | snapshots |
| `snapshot_take` | path, label? | `Snapshot` | snapshots |
| `snapshot_restore` | path, id | `NoteMeta` — keeps *Before restoring* first; byte-identical | snapshots |
| `snapshots_usage` | — | `{ count, bytes }` | snapshots |
| `spell_check` / `spell_suggest` / `spell_add` / `spell_ignore` | words / word | misspelled subset / suggestions / — / — | spell |
| `sync_status` / `sync_enable` / `sync_disable` / `sync_add_device` / `sync_remove_device` / `sync_accept_folder` / `sync_share_folder` / `sync_is_synced_path` / `sync_log_tail` | see spec WP-1.1b | `SyncStatus` | sync |
| `sync_open_gui` | — | — (opens Syncthing's own web UI in the default browser) | sidecar |
| `graph_build` | focus (or null for the Folio), depth | `Graph` | index |
| `update_check` | — | `UpdateInfo \| null` (errors as `UpdateError`) | update |
| `update_install` | — | never returns on success — the app restarts | update |

Events: `folio-changed` → `FolioChanged { paths }` (debounced watcher, emitted after the index has applied the change); `index-progress` → `IndexProgress { done, total }` during builds; `update-progress` → `UpdateProgress { downloaded, total, done }` while an update downloads (throttled to 150 ms, and the last one always lands).

All results are `{status:"ok",data}|{status:"error",error:E}`; `FolioError` is `{kind, detail}`, and the update commands carry `UpdateError` instead — nothing about an update is about a Folio.

## Data on disk

- **Folio:** `<root>/.aml/config.yaml`, `<root>/.aml/snapshots/`, `<root>/.stignore` (created by `Folio::create`). Everything else in the root is user content; dotfiles, `node_modules` and `.aml-tmp-*` are invisible to the tree.
- **Per device (app-data dir):** `recent-folios.json`, `index/<hash>.sqlite` (one per Folio, rebuildable, safe to delete), `syncthing/` (sidecar home), `sync-settings.json`. Layout/appearance in webview localStorage, and `aml.update` there too — whether to check for updates, and which version was waved away, are this machine's business (ADR-004).
- **Project:** `<project folder>/project.aml.yaml` — authored, synced, one item per line. A document's own metadata (`synopsis`, `label`, `status`, `target_words`, `deadline`, `type`) is front matter in that document, never in the manifest.
- **Writes** always go through `folio::write_atomic` (temp + fsync + rename).
- **Assets:** `<top-level folder>/assets/YYYYMMDD-HHMMSS-<slug>.<ext>`; notes reference them relatively; displayed via the Tauri asset protocol (scope = Folio root, set on open).

## Quality tooling

`pnpm check` = typecheck → Biome → Vitest → vocabulary grep → clippy `-D warnings` → `cargo test`. Vitest allows 20 s per test: the hosted Windows runner needs ~10 s to render the shell in jsdom. CI runs the same on macOS and Windows plus an unsigned bundle build.

## Shell model (WP-0.5)

- **Panels:** `left` (Folio Browser, Tags, Search, Daily or Boundings view) and `right` (Context: Outline + Properties + Backlinks sections). Each is closed, floating, or pinned — and **pinned looks exactly the same as floating**: both are a card inset from the window, because a panel that redraws itself when you pin it makes you re-find everything in it. Pinning changes what happens next: a pinned panel stays and `Shell` gives `main` a margin its width, so nothing is ever read underneath it; an unpinned one floats over the page and closes on Escape or a backdrop click. Both are resizable.
- **The shell never grows past the window.** `.root`'s grid column is `minmax(0, 1fr)`: an `auto` column refuses to shrink below its content's min-content width, and with enough tabs open (each with a floor of 76px) the whole shell — body, page and centred text with it — used to grow off the right of the screen. The tab strip's own `overflow-x` is what gives instead, and the active tab is scrolled into view when it changes.
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

## Projects: manifest, Binder, Corkboard, dashboard (WP-5.1 – 5.3, 5.8)

- **The folder is the structure; the manifest is the order.** A part is a folder, a document is a note, nesting is nesting. Two trees (Scrivener's model) would need reconciling on every sync, rename and hand-dropped file, and one of them would always be wrong.
- The Binder is **reconciled against the folder on every read**: listed items in the manifest's order, unlisted ones after them in the Browser's order (folders first, then by name), and a line naming a note that has gone is ignored on screen but kept in the file — the likeliest reason a note is missing is that it has not synced yet. Reading a Project never writes to disk.
- `exclude:` is a separate list rather than a flag on a binder line, so leaving a scene out of a compile **adds a line** instead of editing one another device may also have touched. Excluding a part excludes everything under it, so only the part is written down.
- Unknown top-level blocks are preserved verbatim (Stage 6's presets live here); `boundings.yaml`, which has no such future, still drops what it does not know.
- **Per-item metadata is front matter**, written by `front_matter.rs` one line at a time: key order, comments, quoting style and block scalars are left exactly as the user wrote them.
- Word counts and card properties come from `Index::cards_under` — one query per Project, like `types_by_note`. After a card write the command overlays that one row with what it wrote, so the screen does not wait for the watcher to re-index.
- In the UI, **order is the manifest and nesting is the disk**: a drop on a row's outer third reorders, a drop in a part's middle moves the file. `dropPlan`/`nestPlan` are pure and tested; the move is carried out before the order is written, because a rename that failed must not leave an order pointing at somewhere the note never went.
- Which Project you are in is per device and per Folio (ADR-004, `localStorage`), remembered between launches. The Binder replaces the Folio tree in the Browser rather than adding a fourth tab to the three WP-3.10 settled on.
- **Split at cursor** writes the tail to its own file *before* removing it from the note it came from, so a failure leaves the text in two places rather than none — the safety argument that stands in for the snapshot ADR-006 wants and WP-4.1 will build.

## Link graph (WP-7.3)

- **Built in Rust from the index** (`index/graph.rs`): every link resolved through
  `Index::resolve` — the one rule backlinks and renames use — memoised on (folder, target,
  kind), self-links dropped, repeats collapsed into one weighted edge. The Folio graph keeps
  the notes nothing links to; a focused graph is a BFS out `depth` steps over **undirected**
  edges. Over `MAX_NODES` (1200) it keeps the highest-degree notes, ties broken on path, and
  sets `truncated`.
- **Clusters are Boundings** (ADR-011): a note's cluster is the first Bounding holding it in
  file order, and the key lists only the Boundings actually drawn.
- **The layout is pure** (`features/graph/layout.ts`) and therefore tested: a deterministic
  golden-angle seed, grid-bucketed repulsion, springs weighted by link count, gravity to each
  Bounding's centroid and a separation force between centroids. It cools to a standstill;
  `settle` runs it in one go for reduced motion and for tests.
- **Canvas 2D, not SVG**, reading `--aml-*` through `getComputedStyle` and repainting on a
  `data-mode` change or an OS theme flip, so no colour is written outside `tokens.css`
  (ADR-013). In dev the canvas exposes `__amlGraphAt(path)` so e2e can click a dot.
- **Drawn as a map**: Bounding territories (a union path of member circles), beads, curved
  links, rank-ordered labels with collision, a frosted hover card positioned by the draw loop.
  One `requestAnimationFrame` loop runs layout, camera (follows `fitView` until you pan or
  zoom), hover and entrance, and stops when all are still. `GraphControls` (zoom, fit) is how
  the screen's floating buttons reach into the canvas.

## Snapshots (WP-4.1)

- **Not a timer.** `snapshots::before_write` runs before every write AML makes to a note: if this
  run has not looked at that note in `AUTO_EVERY_MS` (30 min) — an in-memory map, so a restart
  is a new sitting — the text on disk is kept, unless it is byte-identical to the newest
  Snapshot. The first save of a sitting keeps the note as it was; a machine that only received
  the edit by sync never duplicates the other's Snapshot. A failure is logged and never stops
  the save.
- **Labelled keeps** (`keep_before`) before `restore_snapshot` and before a Conflicts resolution
  that replaces a note. Restore is `write_atomic` of the Snapshot's bytes.
- **Names**: UTC `YYYYMMDD-HHMMSS[-label].md`; a clash takes the next free second. Labels are
  cleaned for both file systems. Nothing edits a Snapshot, so they cannot conflict; the
  Conflicts walk skips the folder.
- **Retention** (`to_prune`, pure) on a thread at Folio open: all for `keepAllDays` (7), the
  newest per UTC day to `keepDailyDays` (90), labelled for ever, and always a note's newest.
  Settings are `snapshots.*` in `.aml/config.yaml`. Pruned files are removed, not trashed.
- `Folio::rename` carries a note's or folder's history with it (`move_history`, merging).
- **History** saves the editor, reads the note from disk and the list, and diffs with
  `conflicts/merge.ts` (Snapshot → now, or → another Snapshot). Nothing in the shell announces
  it: *Saved* in the status bar is a button that opens it.

## Conflicts (WP-4.2)

- **A copy is recognised by its name** — Syncthing's pattern, anchored — and is a note, a
  settings file (`.yaml`) or any other file. `is_ignored_name` includes copies, so they leave
  the Browser, the note count, the index walk and the Binder; `watch::passes` lets them through
  anyway, even inside `.aml/`, because a copy arriving is what the Conflicts list waits for.
  `Index::update_paths` deletes any row for a copy it is told about.
- **Resolving never deletes.** Keep in place, use the copy, save a combination, keep both. The
  replaced version is copied to a temp file named for what it was and handed to the discard
  step with the copy; in the app that step is the OS Trash, in tests a recorder. The write is
  `write_atomic`. `expected_original_mtime` makes a stale decision fail with `conflict`.
- **Two-way, still.** Snapshots exist since WP-4.1, but the merge does not yet use one as a base.
  `merge.ts` has no base, so it shows where the sides differ and
  never picks a side that could drop text: notes start on *In place*, settings on *Both* (one
  item per line; shared lines are not repeated). *Both* in a note keeps two paragraphs. A
  combination equal to one side is sent as that side.
- **The editor's disk conflict is the same decision**: *Compare* on its banner opens the screen
  with the file on disk against `editor.currentMarkdown()`, and the result is written with
  `note_write` guarded by the mtime read, then reloaded.
- The list is fetched when a Folio opens and when a change event names a copy — never on every
  event, because listing walks the Folio.

## Sync health (WP-4.3)

- `SyncStatus` carries each device's `lastSeen` and `paused`, and each folder's `paused`,
  `needItems` and `failures` (first 20 of `/rest/folder/errors`, asked only when `pullErrors`
  is non-zero). All REST stays in `sidecar::syncthing`.
- `describeSync` adds *Sync paused*, *NAS offline · seen …* and *Sync stuck · N files*.
- `syncTrouble` raises `SyncTroubleBanner` only while the NAS is **connected**: for failed
  files, or for a folder at the same unfinished completion for `STALLED_AFTER_MS` (10 min),
  tracked by `trackProgress` from the existing 5 s polls. Offline never raises it. Dismissal is
  keyed to the particular trouble, so new trouble shows again.
- `Syncthing::open_gui` opens the sidecar's web UI with the OS opener (`open`, `rundll32
  url.dll`, `xdg-open`); no Tauri plugin.

## Diagrams (WP-7.1)

- **The file is the deliverable**: a diagram is a complete, standalone `.svg` in the note's
  `assets/` folder (WP-1.3's convention), referenced by an ordinary markdown image link. No
  new syntax, no new node type — the parser and compile already know what an image is.
- **Re-editable because it carries its model**, in `<metadata id="aml-diagram">`: one item per
  line, deterministic, XML-escaped. Reading is forgiving — an unknown record, key, kind or tone
  is ignored or replaced, and an edge whose ends are missing is dropped — so a drawing written
  by a later AML opens as much of itself as this one understands.
- **One renderer, used twice.** `DiagramBody.tsx` is mounted by the editor and serialised by
  `export.ts` through `renderToStaticMarkup`, so the `.svg` on disk is by construction the
  picture that was on screen. Text wrapping is arithmetic (`shapes.ts`), never measured in the
  DOM, because the export has no layout engine.
- **SVG, not canvas** — the opposite of the graph's choice, for the opposite reason: tens of
  shapes rather than a thousand, and SVG is the output format anyway. Pointer handling is on
  the root with one `pick` function deciding what a press lands on, so no shape carries a
  handler. In dev the stage exposes `__amlDiagramAt(id)` so e2e can find a shape.
- **Colour** (ADR-013): the exported file defines `--ink`/`--paper`/`--line` with a
  `prefers-color-scheme` block and paints its own background, so it is legible anywhere; tone
  literals live in `model.ts` beside the Corkboard's, never in a `.module.css`. The editor
  reuses the same stylesheet with those three pointed at the app's tokens.
- **Editing overwrites the same file** through `asset_write_text`, so a note's link never goes
  stale and `assets/` never fills with orphans. Both new commands go through
  `Folio::resolve_from_note`, which is what stops a note reaching outside the Folio.
- The way in is the editor's own right-click menu (`editor/extensions/context.ts` +
  `EditorMenu.tsx`), which stands aside for a misspelled word explicitly rather than relying on
  plugin order; `/diagram` in the slash menu and the palette is the same command.

## Appearance (WP-3.2)

- Colours, faces and measure live in the Folio's `.aml/config.yaml`, because the look of the work travels with the work (ADR-010); a per-device override in `localStorage` wins on the one machine that wants something else, and is never written to the Folio.
- An edited token is a custom property on `:root`; a reset **removes** it so `tokens.css` stays the only home of the defaults. The editor stylesheet reads `--aml-measure`, `--aml-leading` and `--aml-paragraph-spacing` with its own values as fallbacks.
- Bundled faces are fetched by `pnpm fonts:fetch` into `public/fonts/` and are not committed, like the Syncthing sidecar; they are SIL OFL 1.1 and the licence is downloaded beside each file.

## Writing modes (WP-3.1)

- Focus, Typewriter and Zen are per device (`aml.writing`) and independent. Focus and Typewriter are a single ProseMirror plugin that only ever adds decorations and scrolls — it cannot change the document.
- Focus dims every top-level block but the caret's; in sentence mode it also dims the rest of that block, mapping text offsets to document positions by flattening the block with a one-character stand-in per inline leaf.
- Zen renders the editor alone without touching the layout store, so leaving it restores whatever was pinned; Escape and the palette are the ways out.

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
- **`.stignore` is AML's**, written into the Folio root and upgraded in place by `folio::upgrade_stignore` when it is byte-for-byte one AML wrote before (a hand-edited one is the user's and is left alone). Comments in it are `//`, not `#`, and every pattern carries **`(?d)`** — without that Syncthing will not delete a directory that still holds an ignored file, and since macOS leaves a `.DS_Store` in every folder Finder has opened, a folder deleted on the other machine could never be removed and sat in the queue for ever at 95%.

## Updates (WP-8.1 – 8.2)

- **Releasing:** `node scripts/version.mjs <v>` writes the version into `package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `Cargo.lock`; `pnpm version:check`
  (inside `pnpm check`) fails if they ever disagree. A `v<version>` tag runs `release.yml`,
  which builds both platforms, signs the update bundles, generates `latest.json` from the
  `.sig` files and publishes the release. `docs/RELEASING.md` is the checklist.
- **The endpoint** is `releases/latest/download/latest.json`, an asset of the release itself.
  The release is *published*, not drafted: a draft has no `releases/latest`, and every
  installed copy would go on reporting it was already the newest version.
- **Signature, not certificate (ADR-012):** the bundler signs each update bundle with AML's own
  minisign key (private half in repository secrets and `~/.tauri/aml-updater.key`, public half
  in `tauri.conf.json`). A bundle without a matching signature is refused before it is
  unpacked. This is unrelated to OS code signing, which AML still does not have.
- **Platforms:** macOS replaces `AML.app` from the ad-hoc-signed `AML.app.tar.gz`; Windows runs
  the NSIS `-setup.exe`, which installs for the current user, so no update asks for an
  administrator password. The MSI is published for a per-machine first install and is never an
  update target — `latest-json.mjs` refuses to point at one.
- **In the app:** `update_check` then `update_install`, both Rust (ADR-001); the webview never
  fetches. Checks run 5 s after launch and every six hours, silently — a failed background
  check says nothing. `features/update/` holds the pure helpers (version ordering, what a
  dismissal means, progress arithmetic), the store and `UpdateScreen.tsx`; the status bar's
  version opens it and grows a filled chip when a release is waiting.

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
