# WP-2.5 — Search
**Stage:** 2 · **Depends on:** 2.1, 2.4 · **ADRs:** 001, 007 · **Sessions:** 1

## Goal
Folio-wide search with a small query language, marked excerpts in context, and replace-in-the-open-note.

## Design
- **Query language** (`src-tauri/src/index/search.rs`) — one parser, one evaluator, in Rust:
  - `word` matches at word starts (so `interview` finds *interviews* and *Interview protocol*, but not *counterinterview*), `"a phrase"` is a case-insensitive substring, `/re/flags` is a Rust regex over the raw text.
  - `-term` excludes, `a OR b` alternates, `(…)` groups; adjacent terms are ANDed.
  - Fields: `path:`, `file:`, `title:`, `tag:` (nested tags included), `has:image|link|task|code|table`, `bounding:` (always false until WP-2.8), and any front-matter property (`status:drafting`, `type:chapter`; a bare `key:` means "has a non-empty value").
  - `parse` never fails on shape — a half-typed query just matches less; only a bad regex is an error, returned in `SearchResponse.error` so the panel can show it while the user keeps typing.
- **Execution:** the required (non-negated, non-OR) word and phrase terms become an FTS5 `MATCH` pre-filter; the candidate notes are then read from disk and evaluated exactly, so what the user sees is the file, not the index. Results sort by match count desc, then path; `total` is the true count and `limit` (200) only truncates the list.
- **Excerpts:** `snippets_for` walks the file, tracks the current heading as `section`, skips fenced code, and wraps hits in `«»` (up to 3 lines per note; a field-only query shows the note's first line). The panel renders `«…»` as `<mark>` — the marker never reaches a `.md` file.
- **Panel** (`features/search/SearchPanel.tsx`): a third segment in the left panel next to Folio and Tags, `mod+shift+F` / palette **Search Folio**. Typing is debounced 150 ms and each run is generation-guarded, so a slow query cannot overwrite a newer one. `data-query` on the result list names the query the results belong to (the e2e suite waits on it).
- **Replace in this note** rewrites the open note's text-term matches in the editor (`features/search/terms.ts` mirrors the tokenizer's *shape* in TS to find the matches; it never evaluates a query — the index is the only place a query is run). Code marks are skipped and edits apply from the end so earlier positions stay valid. It is deliberately per-note: a Folio-wide replace is not offered.
- **Dependencies:** `regex = "1"` — `/re/` terms need a real regex engine, and one whose matching is linear in the input: a user-typed pattern runs over every candidate note, so a backtracking engine would let an innocent query hang the app. No other crate in the tree provides it.

## Acceptance criteria
- [x] Parser table of 40+ shapes: words, phrases, regex with flags, `-`, `OR`, nesting, fields, junk input; a bad regex is the only error (`index/search.rs`).
- [x] Evaluation over a built Folio: words at word starts, phrases, regex, every field, `AND`/`OR`/`NOT` (`index/search.rs`).
- [x] Snippets mark each hit, count them and carry the section heading (`index/search.rs`).
- [x] `textTermsOf` keeps words/phrases/regex and drops fields, exclusions and operators; `termsToRegex` builds one matcher (`features/search/terms.test.ts`).
- [x] E2E: `mod+shift+F` focuses the field; `manipulation` marks the hit and opens the note; `interview`, `interview -tag:journal`, `status:drafting`, `"needs a table"`, `/methodolog\w+/` each narrow as specified; `/(/ ` shows the regex error; replace rewrites the open note (`e2e/search.spec.ts`).
- [ ] On your Folio: a query you actually use returns what you expect and is fast enough to type into (`docs/qa/stage-2.md` §13).

## Lessons recorded
- Debounced panels need a settled marker for tests: asserting on the summary line alone let a stale result satisfy the assertion between queries. The result list carries `data-query`, and the spec waits for it before asserting.
- The dev mock models the language only as far as ANDed terms; it says so in a comment. Mocks that quietly claim more than they implement are worse than mocks that admit their limits.
