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
| `src/app/` | Shell: `App.tsx`, `tokens.css` (ADR-010), `global.css`, later layout/panels/palette |
| `src/features/<feature>/` | Feature folders: components, store, tests. No cross-feature imports except through `src/lib` |
| `src/lib/` | Pure utilities (markdown, paths, dates) with unit tests |
| `src/ipc/` | Generated bindings + `index.ts` re-export |
| `themes/` | Reserved for Book Designs' CSS previews; app colours live in `tokens.css` |
| `test-corpus/` | Round-trip markdown corpus (WP 0.6) |
| `e2e/` | Playwright specs (WP 0.6) |
| `scripts/` | Repo tooling (`check-vocabulary.mjs`) |

## Commands (current)

| Command | Args | Returns | Domain |
|---|---|---|---|
| `app_info` | — | `AppInfo { name, version, platform, arch, debug }` | app |

## Data on disk

Nothing yet. Folio layout is specified in `03-GLOSSARY-AND-NAMING.md` §4 and ADR-004.

## Quality tooling

`pnpm check` = typecheck → Biome → Vitest → vocabulary grep → clippy `-D warnings` → `cargo test`. CI runs the same on macOS and Windows plus an unsigned bundle build.
