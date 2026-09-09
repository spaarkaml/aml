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
| `src-tauri/src/commands/<domain>.rs` | One file per command domain (`app`, later `folio`, `notes`, `index`, `snapshots`, `sync`, `compile`) |
| `src/app/` | `App.tsx`, `commands.ts` (shell commands + `SHORTCUTS` table), `tokens.css`, `global.css`, `shell/` (Shell, TopBar, SidePanel, StatusBar) |
| `src/features/<feature>/` | Feature folders: components, store, tests. Current: `commands` (registry, palette), `layout` (panel/Layout store), `appearance` (mode). No cross-feature imports except through `src/lib` |
| `src/lib/` | Pure utilities with unit tests: `fuzzy.ts`, `platform.ts`; later markdown, paths, dates |
| `src/ipc/` | Generated bindings + `index.ts` re-export |
| `themes/` | Reserved for Book Designs' CSS previews; app colours live in `tokens.css` |
| `test-corpus/` | Round-trip markdown corpus, 48 files in 6 categories, `manifest.json` declares expectations |
| `e2e/` | Playwright specs run in Chromium against Vite with mocked IPC (`src/dev-mocks.ts`); tauri-driver has no macOS support |
| `scripts/` | `check-vocabulary.mjs`, `contrast-report.mjs` |

## Commands (current)

| Command | Args | Returns | Domain |
|---|---|---|---|
| `app_info` | — | `AppInfo { name, version, platform, arch, debug }` | app |

## Data on disk

Nothing yet. Folio layout is specified in `03-GLOSSARY-AND-NAMING.md` §4 and ADR-004.

## Quality tooling

`pnpm check` = typecheck → Biome → Vitest → vocabulary grep → clippy `-D warnings` → `cargo test`. CI runs the same on macOS and Windows plus an unsigned bundle build.

## Shell model (WP-0.5)

- **Panels:** `left` (Browser) and `right` (Context). Each is closed, open-as-overlay, or pinned. Overlay closes on Escape or backdrop click; pinned takes layout space and is resizable.
- **Layouts:** `desk` (Browser pinned) and `page` (nothing pinned). Persisted per device in localStorage key `aml.layout`.
- **Commands:** everything user-triggerable registers in `commandRegistry` with an optional shortcut (`mod+shift+e` grammar). `useGlobalShortcuts` binds them; `CommandPalette` lists them. Shortcut table lives in `src/app/commands.ts` and is exercised by `e2e/shell.spec.ts`.
- **Appearance:** `aml.appearance` setting `system|paper|ink` → `<html data-mode>`; tokens in `tokens.css`.
