# WP-2.1 — Index (SQLite FTS5)
**Stage:** 2 · **Depends on:** 1.1, 1.6 · **ADRs:** 001, 004, 007 · **Sessions:** 1

## Goal
Every note's facts — title, aliases, headings, tags, links, front-matter properties and full text — live in one SQLite database per Folio in local app-data, built in the background, kept current by the watcher and rebuilt on demand. Stage 2's links, backlinks, tags, search and Boundings panels all read from it.

## Design
- **Module `src-tauri/src/index/`.** `extract.rs` pulls `NoteFacts` out of markdown (line-based, lenient: front matter `title`/`aliases`/`tags` and every scalar or list property; ATX headings with level and line outside fences; `[[wiki]]`, `![[embed]]` and `[text](rel.md)` links with target, heading, alias, kind and line; `#tag/nested` outside fences and code spans, lower-cased, purely numeric tags ignored; body text and a word count). `mod.rs` owns the database.
- **Database.** `<app-data>/index/<fnv1a(root)>.sqlite`, WAL, `foreign_keys` on. Tables `notes(id, path, stem, title, mtime, size, words)`, `aliases`, `headings(level, text, line)`, `tags(tag, line)`, `links(target, key, heading, alias, kind, line)`, `props(key, value)` (all cascade on note delete), `meta`, and the FTS5 table `notes_fts(title, body)` (`unicode61 remove_diacritics 2`, rowid = `notes.id`). `links.key` and `notes.stem` are lower-case file stems so backlinks (WP-2.3) and rename propagation (WP-2.2) are a join. `SCHEMA_VERSION` mismatch drops and recreates everything; deleting the file does the same (Gate 2: "delete the local index → rebuild within budget").
- **Lifecycle.** `commands::index::open_for` runs in `install()` after the Folio is set: opens the database, stores the handle in `AppState.index`, and spawns a thread that runs `refresh` (walk the tree, re-read notes whose mtime or size moved, drop vanished ones — on a fresh file this is the full build). `folio_close` drops the handle. `index_rebuild` clears the tables and refreshes on a thread (refused while a build is running). Every build reports `IndexProgress { done, total }` every 100 notes and at the end.
- **Incremental.** The watcher (`folio/watch.rs`) calls `commands::index::apply_changes` with the debounced paths *before* emitting `FolioChanged`, so anything the UI re-queries already sees the new state. A path that is a note is re-read, a folder is walked, a missing path drops the note or everything beneath it. Builds use a second connection (`Index::for_thread`) sharing the `Progress` atomics, so the watcher and Quick Open never wait on a build; the 15 s busy timeout covers the moment a build commits.
- **Quick Open** keeps its ranking in memory (ADR-007) but `folio_index` now reads `notes` + `aliases` + `headings` from SQLite (2 ms for 5,000 notes) instead of walking the tree. The in-memory `NoteIndex` is gone.
- **Search.** `index_search(query, limit?)` runs a plain FTS5 match: each word quoted (user-typed operators cannot break the query), the last word as a prefix, `"quoted phrases"` kept; ranked by `bm25(title × 4, body)`, with a `«»`-marked snippet. The query language (`path:`, `tag:`, `-not`, `OR`, …) is WP-2.5.
- **UI.** `features/index/store.ts` listens to `index-progress`, polls `index_status` only while a build runs, and refreshes Quick Open when a build ends. Status bar shows `Indexing 120 / 5,000` while building and nothing otherwise. Palette: **Rebuild Index** (group Folio).
- **Dependencies:** `rusqlite 0.40` with `bundled` (SQLite compiled in with FTS5 — no system SQLite on Windows, identical build on both platforms; ADR-007 names SQLite FTS5).

## Acceptance criteria
- [x] Extraction: title/aliases/headings incl. fences and block lists; wiki/embed/markdown links with heading, alias, line, percent-decoding; inline + front-matter tags; code fences and spans hide syntax (Rust tests in `index/extract.rs`).
- [x] Build, refresh (unchanged files not re-read; changed re-read; removed dropped with cascaded rows), `update_paths` for files, folders and removals incl. FTS rows (Rust tests in `index/mod.rs`).
- [x] Full-text search: prefix, phrase, diacritics folded, operators harmless, snippet marks hits (Rust test).
- [x] **5,000 notes indexed in 562 ms** (release, Mac M-series, `five_thousand_notes_under_five_seconds --ignored`); `folio_index` 2 ms, search 2 ms. Budget: < 5 s.
- [x] UI never blocks: builds run on their own thread and connection; `Rebuild Index` shows progress in the status bar and Quick Open answers afterwards (e2e `index.spec.ts`).
- [x] Second handle shares progress; database path is stable per Folio and distinct between Folios (Rust tests).
- [ ] Live: opening a real Folio logs `index refreshed: … in … ms` and a `.sqlite` appears under `~/Library/Application Support/com.brycereeves.aml/index/`. *(Bryce: `docs/qa/stage-2.md` §1–5; the wiring compiled and the app booted, but the Folio was not opened in this session.)*

## Lessons recorded
- Contentless FTS5 tables cannot delete by rowid without the original text; a plain FTS5 table keyed by `notes.id` costs a copy of the body but makes incremental updates trivial.
- A `title` is front matter or the file name, never the first heading — Quick Open and search agree on that (a test assumed otherwise and was wrong).
