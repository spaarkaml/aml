# WP-5.3 — Corkboard
**Stage:** 5 · **Depends on:** 5.1, 5.2 · **ADRs:** 004, 010, 013 · **Sessions:** 1

## Goal
One card per document, grouped by part, in Binder order — what the book is about, at a
glance, and rearrangeable.

## Design

### The board holds nothing of its own
A card's synopsis, label and status are the note's own front matter (ADR-004). Typing on a
card writes `synopsis:`, `label:` or `status:` into the document, one line changed and the
rest untouched, so what you write here is legible in the file, in the Properties panel, and
to anything else that reads markdown. There is no board file, and nothing to reconcile.

The synopsis saves when you leave the card rather than on every keystroke — one write per
edit — and Escape puts back what was there. A card re-read from disk (a sync, another device)
wins over a field nobody is typing in.

### Moving a card moves the document
There is one order and the Binder is it, so a card drag runs the same `dropPlan` a Binder
drag runs. Dropping on the left half puts the card before, the right half after.

### Colour
By status (the default), by label, or off. The value is free text, so nobody chose the
colours: they are a **stable hash over the ADR-010 palette**, which means the same word is
the same colour in every Project, on every machine, for ever. A key beside the control says
which is which, because a colour nobody chose needs saying.

The colour is a **band at the head of the card**, never the whole card: a tinted card makes
its own text harder to read, and the text is the point.

### Where it lives
A page, not a dialog: the grid wants every pixel of width, and it is a place you work rather
than a thing you check. It shares that page with the dashboard (WP-5.8) under two tabs, with
the Binder still in the Browser beside it. Opening a note — clicking a card's title, a Binder
row or a tab — is how you leave.

**Dependencies:** none added.

## Acceptance criteria
- [x] Documents group under their part, with a group for anything before the first part, and
      a part's words include its subsections (unit tests `features/project/project.test.ts`).
- [x] A label gets the same colour however it is cased or spaced, a different one from another
      label, and nothing gets no colour (unit test).
- [x] E2E: a synopsis typed on a card lands in that note's front matter, with the body
      untouched and the previous status replaced in place; the card shows a synopsis that was
      already in the file (`e2e/project.spec.ts`).
- [ ] **Gate 5:** reorder in the Corkboard and check the Binder and file order agree
      (`docs/qa/stage-5.md` §5, §6).

## Not in this work package
- Card size, board zoom, and free placement on the board. AML's board is an ordered list
  drawn as cards; a pinboard where position means nothing would be a second truth again.
- Labels and statuses as a chosen vocabulary with chosen colours. They are free text for now;
  a Project-level list of them belongs with compile presets in the manifest.
- Cards for parts. A part is a heading on the board, not a card.
