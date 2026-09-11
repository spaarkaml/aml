# WP-3.3 — Note Types
**Stage:** 3 · **Depends on:** 2.1, 2.7, 3.10 · **ADRs:** 002, 004, 007, 011, 013 · **Q:** 9 · **Sessions:** 1

## Goal
A note can say what it *is* — chapter, character, source — and the app can show you, without
any of it leaving plain markdown.

## Design

### A type is what the note says it is
`type: chapter` in the note's own front matter, as Q9 settled. No database, no sidecar file
mapping notes to types, nothing to migrate: open the Folio in any other editor and the types
are still there, in the notes, in a field that was already being indexed and was already
searchable as `type:chapter`.

So **nothing is seeded**. The proposed list in Q9 (`scene`, `chapter`, `character`, …) is not
written into a new Folio and never was going to be: a type exists the moment a note or a
template says it does. Discovery has three sources and the union is what the app knows:

1. `_templates/` — every template's front-matter `type:`.
2. The index — every distinct `type:` value in use, with its count.
3. `.aml/types.yaml` — the ones you have given a colour, an icon or a name of your own.

### The two halves, kept apart
- **What a type means** lives in `_templates/`. The template that declares `type: chapter` is
  what makes a chapter, and the front-matter keys it carries *are* the properties a chapter
  has. That is the source of truth for a type's fields, it is a file you can edit in the app,
  and it needs no registry at all. It is also already wired: a template is already a palette
  command, so "New Chapter Note" comes free.
- **What a type looks like** — a colour and an icon — lives in `.aml/types.yaml`. It is
  synced, so it is written one field per line: two devices recolouring different types edit
  different lines.

That file holds **only decisions**. A type whose name, colour and icon are all AML's own is
removed from it rather than written out, and a Folio where nothing has been customised has no
file at all. It is a list of what you chose, not a copy of what the app worked out.

A type's default colour is a hash of its id over the ADR-010 palette — deterministic, so the
same type is the same colour on both machines before the file has travelled between them.
Default icon is nothing, which draws as a dot in the type's colour; an emoji replaces it.

### Where it shows
- **The Browser.** A typed note wears its type's mark *instead of* the generic page icon, in
  the same 14px slot, so rows never shuffle as notes gain and lose a type. An untyped note is
  the ordinary case and keeps the page icon — a badge saying "no type" is noise.
- **The Properties panel.** A picker over the types the Folio knows, so the value is one you
  can search for rather than one you have to remember how to spell. `type` is no longer listed
  as a text field below it: the picker is a better editor for the same front-matter key, and
  offering both invites editing it two ways. The YAML view still shows everything.
- **Type-specific properties.** Under the picker, the fields this type's template declares and
  this note has not got, each one click away. This is the whole of "type-specific properties":
  the type says what a chapter carries, the panel offers it, the note keeps plain YAML.
- **Settings → Note types.** Every type found, with its notes count, the command that makes
  one, its fields, and a colour well and icon box. There is deliberately no "New type"
  button: you make a type by writing one, and this is where you dress the ones you have.

### Dependencies
None added. One new Rust module (`note_types.rs`), one new index query, three commands.

## Acceptance criteria
- [x] Types are found from templates, from notes in use and from the file, with no file
      required; ids are slugged and names derived (Rust tests `note_types.rs`).
- [x] A type's colour is stable across machines before anyone chooses one (Rust test).
- [x] Saving keeps decisions and forgets defaults — a type back at its own colour and icon
      takes the file with it; a hand-written file is read and rewritten in shape (Rust tests).
- [x] `type_counts` / `types_by_note` answer from the index in one query each (Rust).
- [x] The store loads both halves together, resolves a type however the note spelled it, shows
      a colour change at once and writes it once (unit tests `features/types/store.test.ts`).
- [x] E2E: the picker reads the note's own front matter, offers the template's missing fields,
      and writes `type:` back as YAML; an untyped note stays untyped and can be given one;
      Settings lists each type with its notes and a chosen icon survives a reload and reaches
      the Browser (`e2e/types.spec.ts`).
- [ ] **Gate 3:** give three types an icon on the Mac and see them arrive on the PC through
      `.aml/types.yaml` (`docs/qa/stage-3.md` §16).

## Lessons recorded
- The debounced save first returned a promise that a second call silently cancelled, so
  anything awaiting the first keystroke's write waited forever. A debounce that hands back a
  promise has to resolve *every* caller in the burst when the one write lands — the unit test
  that caught it asserts exactly that, because a 20-second timeout is all the symptom you get.
- The dev mock emits no watcher event, so nothing index-derived refreshes after a save in the
  browser. That is a property of the mock, not of the app — in the app the watcher's
  `folioChanged` refreshes types like everything else — so the e2e asserts the saved YAML and
  the reload, not the live badge. Worth remembering before writing an e2e that waits on a
  refresh the mock will never trigger.

## Not in this work package
- Creating a type (and its template) from Settings. A type is made by writing one; a button
  that writes a `_templates/*.md` for you is a template feature, not a type feature.
- Type-specific *editors* — a character sheet, a board view for `task-board`. Q9 raises
  planning boards; those are a Stage 5/7 view over a type, not the type itself.
- Colouring the tab strip or the editor by type. The Browser and the Properties panel are
  where you are asking "what is this"; a coloured tab is decoration.
- Filtering the Browser by type. Search already answers `type:chapter`, and a second filter
  UI would be a second way to do it.
