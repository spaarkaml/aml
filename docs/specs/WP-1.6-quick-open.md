# WP-1.6 — Quick Open
**Stage:** 1 · **Depends on:** 1.5 · **ADRs:** 001, 006 · **Sessions:** 0.5

## Goal
Jump to any note in the Folio in a keystroke or two: ⌘O, type part of a title, alias, heading or path, Enter. Empty query shows recent notes. An unmatched query offers to create the note.

## Design
- **Index (Rust, `folio/index.rs`):** `NoteIndex` in `AppState` holds `{ path, title, aliases, headings, mtime }` per note. `folio_index` walks the tree and re-reads only notes whose mtime changed (vanished notes are dropped); cleared on Folio close. Extraction is line-based on purpose: front-matter `title:` and `aliases:`/`alias:` (flow list, block list or scalar), ATX headings outside fenced code. Odd YAML never fails the index, it just yields less. This is the "separate in-memory fuzzy index" ADR-007 calls for. *Since WP-2.1 `folio_index` reads the same fields from the SQLite index (`src-tauri/src/index/`); the tree walk and `NoteIndex` are gone, the ranking below is unchanged.*
- **Refresh:** the UI reloads the index on Folio open and after every `FolioChanged` (already debounced 300 ms in Rust).
- **Ranking (`quickopen/search.ts`):** `fuzzyScore` from `lib/fuzzy` on title (×3), alias (×2.5), heading (×1.5), path (×1); a note appears once under its best match; recently opened notes get a small bonus. Empty query → recents (newest first, kept per Folio in the tabs store, max 20) then the rest by title. Capped at 40 rows.
- **UI (`QuickOpen.tsx`):** shares the palette's styles; rows show title, matched alias (`= alias`) or heading (`# heading`), parent folder and a kind badge. Enter/click opens in a tab; a heading match then places the caret in that heading (`openNoteAt` waits for the editor to show the note). Last row "Create note “…”" appears when no title or alias equals the query; it creates `<query>.md` at the Folio root and opens it.
- **Command:** `note.quickOpen` ⌘O (global; no-op without a Folio; closes the palette if open).
- **Dependencies:** none added.

## Acceptance criteria
- [x] Title / alias / heading extraction incl. fenced code and block aliases (Rust tests).
- [x] Index refresh drops removed notes and reuses unchanged ones (Rust test).
- [x] Ranking: title > alias > heading > path; recents first on empty query; no duplicates (unit tests).
- [x] ⌘O → recents → filter → Enter opens the note (e2e).
- [x] Alias and heading matches are labelled; heading match puts the caret in the heading (e2e).
- [x] Unmatched query creates and opens the note (e2e).
- [ ] < 10 ms results on a 2,000-note Folio. *(Measure once a large real Folio exists; the search is a single pass over an in-memory array.)*

## Lessons recorded
- The editor instance appears a frame after the store's `path` changes; anything that must act on the freshly opened note (caret placement) subscribes to the store and retries on the next animation frame.
