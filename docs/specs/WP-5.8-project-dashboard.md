# WP-5.8 — Project dashboard
**Stage:** 5 · **Depends on:** 5.1, 3.4, 3.7 · **ADRs:** 004, 011 · **Sessions:** 1

## Goal
How big the book is, how much of it is in the compile, where the words are — and, at last,
the Project's own goal.

## Design

### The goal WP-3.4 could not ship
WP-3.4 deliberately attached goals to a **note**, because ADR-011 puts a Project's goal in
`project.aml.yaml` and nothing wrote that file yet. It does now. `target` and `deadline` are
manifest keys, so a book's goal follows the book between machines, and the arithmetic is the
same arithmetic — `goals.ts`'s `fraction`, `daysLeft`, `pacePerDay` and `describePace`,
already tested — run against the Project's included words.

Progress counts **the words a compile would take**, not every word in the folder: a chapter
you have decided to leave out is not progress towards the book.

### The figures
Words, words in the compile, documents, parts, and — only when there are any — how many
documents are left out. Everything is derived from the Binder Rust has already reconciled, in
pure functions with tests, so no number on this screen is worked out twice.

**Where the words are** is by part, with a bar against the longest — the same shape as
Statistics' per-heading table, because the question ("which chapter has run away with
itself") is the same question one level up. **By status** is the other axis: how many
documents and how many words sit in each state, with the ones that have no status last rather
than hidden, because untouched is a state too.

### Title, target and deadline are edited here
Three fields at the head of the Goal section, saved on blur. They are the only things on the
screen that write to the manifest.

**Dependencies:** none added.

## Acceptance criteria
- [x] Documents, parts, total words, compiled words and the excluded count are right, and an
      excluded document's words still count towards the Project's total but not the book's
      (unit tests `features/project/project.test.ts`).
- [x] Status rows are ordered by words with the unset ones last (unit test).
- [x] E2E: setting a target shows progress against it; renaming the Project renames the chip
      in the top bar; the parts table and the status list render (`e2e/project.spec.ts`).
- [ ] **Gate 5:** the totals agree with a real manuscript (`docs/qa/stage-5.md` §7).

## Not in this work package
- Words written today, per Project. The daily tally is per device and per Folio (ADR-004,
  WP-3.4); splitting it per Project means deciding what a word written in a note that later
  moved into the book counts as.
- A burndown against the deadline. One pace figure is the number that changes what you do
  today; a chart of the last month is not.
- Compile from here. Stage 6.
