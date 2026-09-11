# WP-5.2 — Binder panel
**Stage:** 5 · **Depends on:** 5.1 · **ADRs:** 004, 006, 011, 013 · **Sessions:** 1

## Goal
Inside a Project, the Browser becomes the book: parts and documents in reading order, which
is the order a compile will use.

## Design

### It replaces the Browser rather than joining it
WP-3.10 settled the Browser at **three tabs on one line**, and a fourth would undo that. So
the Folio tab *becomes* the Binder while a Project is open — the segment is labelled with
the word **Binder**, and the panel's header carries the way back out (`‹ Folio`). Inside a
book the rest of the Folio is noise; outside one the Binder has nothing to show.

Which Project you are in is **per device and per Folio** (`localStorage`, ADR-004): it is
where you are working, not a fact about the work. It is remembered between launches, because
re-entering a book every morning is not a decision anyone wants to make twice.

### Project tabs in the top bar
A chip beside the breadcrumb names the Project and opens its dashboard. It sits before the
note tabs because it contains them.

### Dragging: order is the manifest, nesting is the disk
A row's outer thirds are an insertion line — dropping there is a **manifest change** and
nothing on disk moves. A part's middle third nests — dropping there **moves the file** into
that folder, because the Binder's structure *is* the folder's and there is no second truth to
keep in step. A cross-part drop onto a document does both: the move, then the order.

`dropPlan` and `nestPlan` are pure functions over the Binder, so every case has a test: the
plan refuses a part dropped into itself, a name that would collide in the destination, and a
drop that would change nothing. The move is carried out **first** — a rename that failed must
not leave an order pointing at somewhere the note never went — and it goes through the
Folio store's own `rename`, so links into the moved note are offered the same rewrite they
would get from the Browser.

### Include in the compile
The tick at the end of each row. Quiet when it is on, because being in the book is the
ordinary state; the row dims and its name is struck through when it is off. Excluding a part
excludes everything under it, so only the part is written to `exclude`.

### Split at cursor
⌘⇧K. Everything after the caret becomes a new document beside this one, named after its first
heading, placed straight after it in the Binder, and opened.

A caret at the **top of a block** splits above that block, so the half left behind does not
keep an empty heading and the half that leaves begins with its own title.

The order of operations is the safety argument. The tail is created and written **before** a
character is removed from the note it came from, so a failure anywhere leaves the text in two
places rather than none. ADR-006 would have a snapshot taken before a destructive edit and
the snapshot engine does not exist yet (WP-4.1); writing before deleting is what makes this
safe without one, and the editor's own undo still puts the note back.

**Dependencies:** none added.

## Acceptance criteria
- [x] Reordering inside a part changes the manifest and nothing else; moving a document to
      another part moves the file; a part carries its documents; a collision or a part dropped
      into itself is refused (unit tests `features/project/project.test.ts`).
- [x] The split names the new document after its first heading, falls back to its first few
      words, and makes an unusable name usable (unit test).
- [x] E2E: a Project opens into its Binder with the Browser's order, the Project is named in
      the top bar, and leaving puts the whole Folio back; a drag reorders and the new order
      survives leaving and re-entering the Project (it came from the file, not the screen);
      the compile tick marks a document out and takes a part's documents with it; ⌘⇧K puts the
      rest of a note in a document of its own, on disk, and opens it (`e2e/project.spec.ts`).
- [ ] **Gate 5:** reorder a real manuscript and check the Binder and the file order agree
      (`docs/qa/stage-5.md` §3, §4).

## Lessons recorded
- A long Quick Open list reaches the centre of the viewport, and Playwright clicks an
  element's centre: `e2e/quickopen.spec.ts` had been clicking the backdrop where the backdrop
  happened to be empty. Three more notes in the mock Folio broke it. A test that depends on
  what is *not* somewhere should say where it is clicking.

## Not in this work package
- Renaming from the Binder uses its own inline field rather than the Browser's, because the
  Browser's belongs to a `TreeNode`. Same behaviour, two implementations — worth merging if a
  third appears.
- Multi-select, and dragging more than one document at a time.
- A Binder for something that is not a Project. Boundings already group across folders.
