# WP-2.3 — Backlinks and unlinked mentions
**Stage:** 2 · **Depends on:** 2.1, 2.2 · **ADRs:** 001, 007 · **Sessions:** 0.5

## Goal
For the open note, see every note that links to it (with the line and the section it sits in) and every plain-text mention of its name that could become a link — and turn those into links with one click.

## Design
- **Backlinks (Rust, `index/backlinks.rs`):** every `links` row from other notes is pre-filtered by key/name and then run through the same `Index::resolve` the editor uses, so a backlink is exactly a link that would open this note. Each carries the trimmed source line and the nearest heading above it (`headings.line`), which the UI uses to jump to that section.
- **Names of a note:** file stem, front-matter `title`, aliases (deduplicated, at least 3 characters).
- **Unlinked mentions:** candidate notes come from an FTS5 phrase match per name; each candidate's body lines (front matter and fenced code skipped) are scanned for case-insensitive whole-word occurrences outside `[[…]]` and `[text](url)`. Capped at 200.
- **Linking a mention:** `link_mention_apply(source, line, matched, target)` rewrites the first unlinked occurrence of `matched` on that line to `[[target]]`, or `[[target|matched]]` when the visible text differs; atomic write; false if the line no longer holds the text. The UI passes the note's stem, or its path when the stem is shared (`wikiTarget`). *Link all* applies mentions one by one (each re-reads the line, so several on one line are safe).
- **Context panel:** the right panel is now **Context** (`app/shell/ContextPanel.tsx`): collapsible *Properties* (unchanged, same test id) and *Backlinks* sections. `BacklinksPanel` reloads when the note changes and on every `folio-changed` (via the link cache version), so a link typed in another note appears within the watcher's debounce. Rows open the source note at its section (`openNoteAt`). Palette: **Show Backlinks**.
- **Commands:** `backlinks(path)`, `unlinked_mentions(path)`, `link_mention_apply`.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Mention scanner: whole words only, case-insensitive, skips text inside wiki and markdown links, skips front matter and fences (Rust tests).
- [x] Backlinks resolve through stem, title and alias forms and `.md` links; carry line, context and section; self-links excluded (Rust test).
- [x] Unlinked mentions found for stem and alias, not inside existing links or fences; linking one rewrites it with the original text as alias, the count drops and the backlink count rises after re-index (Rust test).
- [x] E2E: Context panel shows the linked mention with its section and context, the unlinked mention from the journal, *Link* rewrites the journal line and moves the row to linked; clicking a backlink opens the source; *Show Backlinks* opens the panel (`e2e/backlinks.spec.ts`).
- [ ] On your Folio: open a well-linked note; every backlink you know of is listed; *Link all* on a note with several plain mentions (`docs/qa/stage-2.md` §10–11).

## Lessons recorded
- A late `index_status` answer could stop the progress polling a rebuild had just started (seen as a flaky e2e once other specs ran first). Status requests now carry a generation and stale answers are dropped — the same guard the backlinks store uses for note switches.
- Any command title containing "link" also matches a palette query of `ink`; the shell e2e now filters with `paper ink`.
