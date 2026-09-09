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
| `src-tauri/src/commands/<domain>.rs` | One file per command domain (`app`, `folio`; later `index`, `snapshots`, `sync`, `compile`) |
| `src-tauri/src/folio/` | Folio model, path safety, atomic writes (`mod.rs`), watcher (`watch.rs`), errors |
| `src-tauri/src/state.rs` | `AppState { folio, watcher }` managed by Tauri |
| `src/app/` | `App.tsx`, `commands.ts` (shell commands + `SHORTCUTS` table), `tokens.css`, `global.css`, `shell/` (Shell, TopBar, SidePanel, StatusBar) |
| `src/features/<feature>/` | Feature folders: components, store, tests. Current: `commands`, `layout`, `appearance`, `folio` (store, Welcome, FolioTree, watcher events), `editor` (Tiptap extensions in `extensions/`, `NoteEditor.tsx`, store with debounced save/conflicts, `editorRef.ts`). No cross-feature imports except through `src/lib` |
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
| `note_read` | path | `NoteContent { path, text, mtime, size }` | folio |
| `note_write` | path, text, expectedMtime? | `NoteMeta` (Conflict error if mtime moved) | folio |
| `entry_create_note` / `entry_create_folder` / `entry_rename` / `entry_trash` | paths | — | folio |

Events: `folio-changed` → `FolioChanged { paths }` (debounced watcher).

All results are `{status:"ok",data}|{status:"error",error:FolioError}`; `FolioError` is `{kind, detail}`.

## Data on disk

- **Folio:** `<root>/.aml/config.yaml`, `<root>/.aml/snapshots/`, `<root>/.stignore` (created by `Folio::create`). Everything else in the root is user content; dotfiles, `node_modules` and `.aml-tmp-*` are invisible to the tree.
- **Per device (app-data dir):** `recent-folios.json`. Layout/appearance in webview localStorage.
- **Writes** always go through `folio::write_atomic` (temp + fsync + rename).

## Quality tooling

`pnpm check` = typecheck → Biome → Vitest → vocabulary grep → clippy `-D warnings` → `cargo test`. CI runs the same on macOS and Windows plus an unsigned bundle build.

## Shell model (WP-0.5)

- **Panels:** `left` (Browser) and `right` (Context). Each is closed, open-as-overlay, or pinned. Overlay closes on Escape or backdrop click; pinned takes layout space and is resizable.
- **Layouts:** `desk` (Browser pinned) and `page` (nothing pinned). Persisted per device in localStorage key `aml.layout`.
- **Commands:** everything user-triggerable registers in `commandRegistry` with an optional shortcut (`mod+shift+e` grammar). `useGlobalShortcuts` binds them; `CommandPalette` lists them. Shortcut table lives in `src/app/commands.ts` and is exercised by `e2e/shell.spec.ts`.
- **Appearance:** `aml.appearance` setting `system|paper|ink` → `<html data-mode>`; tokens in `tokens.css`.

## Editor data flow (WP-1.2)

```
disk ──note_read──▶ text ──markdownToDoc──▶ PM JSON ──setContent──▶ Tiptap
Tiptap ──onUpdate──▶ store.changed(doc) ──debounce 1 s──▶ docToMarkdown ──note_write(expectedMtime)──▶ disk
```
- `store.doc` is always the latest document; `docVersion` bumps only on load/reload so the editor reloads content only then.
- Conflict (mtime moved) or watcher change while dirty → banner: Reload from disk / Keep mine.
- Word count from PM JSON (`lib/wordcount.ts`), shown in the status bar.
- Front matter node is guarded by a ProseMirror plugin: it cannot be removed by editing.
