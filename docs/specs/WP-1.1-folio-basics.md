# WP-1.1 — Folio basics
**Stage:** 1 · **Depends on:** 0.5, 0.6 · **ADRs:** 001, 004, 005, 011 · **Sessions:** 1

## Goal
Open or create a Local Folio, see its tree in the Browser, and have the app notice changes made on disk — the foundation every later note feature builds on.

## Scope
- In: `.aml/` initialisation, recent list, path-safe FS commands (tree, read, atomic write with conflict check, create note/folder, rename/move, trash), debounced watcher → `FolioChanged` event, welcome screen, minimal read-only tree.
- Out: Synced/Syncthing pairing (1.1b), full Browser with drag/context menu (1.5), editor (1.2).

## Design
- Rust `folio::Folio` owns the root; every IPC path is Folio-relative and validated by `resolve` (no absolute, no `..`, no `.aml/`).
- Atomic write = temp file beside target + fsync + rename. `write_note(expected_mtime)` refuses if the disk mtime moved (Conflict).
- Watcher: `notify-debouncer-full`, 300 ms, ignores dotfiles/temp files, emits deduped relative paths.
- Recent Folios persisted in app-data `recent-folios.json` (per device, ADR-004).
- Errors: `FolioError` tagged enum → TS `{kind, detail}`; `describeFolioError` gives the human string.
- Dev mocks provide an in-memory Folio for browser e2e.

## Acceptance criteria
- [x] Create Folio writes `.aml/config.yaml`, `.aml/snapshots/`, `.stignore`; Open rejects non-Folios with a "Make it a Folio" offer.
- [x] Path escapes rejected (unit tests).
- [x] 20 consecutive atomic writes leave no temp files; conflict detected on stale mtime.
- [x] BOM stripped on read; hidden and temp files excluded from tree; folders sort first.
- [x] Tree refreshes on `FolioChanged` (wired; verified manually in WP-1.5 QA).
- [ ] Manual: open a real folder on the Mac, add a file in Finder, tree updates within 1 s. *(Bryce, `qa/stage-1.md`)*

## Tests
Rust: 9 `folio` unit tests. TS: store (4), App (3). E2E: `e2e/folio.spec.ts` (3).

## Docs updated
ARCHITECTURE.md (commands table, data on disk), CHANGELOG.
