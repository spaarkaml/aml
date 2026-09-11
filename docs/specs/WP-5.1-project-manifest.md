# WP-5.1 — Project manifest
**Stage:** 5 · **Depends on:** 1.1, 2.1, 2.8 · **ADRs:** 004, 011 · **Sessions:** 1

## Goal
A folder with a `project.aml.yaml` becomes a **Project**: an ordered Binder, what a compile
leaves out, and the book's own goal — without any of it becoming a second truth about the
files.

## Design

### What the manifest holds, and what it does not
ADR-004 gives a Project one manifest holding "ordered Binder tree, compile presets, goals".
The tree is the part that needs care, because AML already has a tree: the folder. Two trees
would need reconciling on every sync, every rename and every file dropped in by hand, and
one of them would always be wrong.

So **the folder is the structure and the manifest is the order**. A part is a folder, a
document is a note, nesting is nesting. The manifest says three things:

```yaml
title: "The Salt Road"
target: 90000
deadline: "2026-12-01"
binder:
  - "part one"
  - "part one/01 Arrival.md"
  - "part one/02 The road.md"
exclude:
  - "part one/02 The road.md"
```

Paths are **Project-relative**, so moving or renaming the Project folder rewrites nothing.

`exclude` is a separate list rather than a flag on the binder line for the merge reason that
governs everything under `.aml/`: leaving one scene out of the compile is **adding one line**,
which every merge tool reconciles, rather than editing a line another device may also have
touched. It is also still valid YAML, which `- "x" skip` would not be.

### Nothing in it is load-bearing
The Binder is reconciled against the folder on **every read**. A note that arrived over
Syncthing appears whether or not it is listed (after the items that are listed, folders first
then by name — the Browser's own order). A line naming a note that has gone is ignored on
screen but **kept in the file**, because the likeliest reason a note is missing is that it has
not synced yet. Reading a Project never writes to disk.

That is what makes the manifest safe to lose: delete it and you have a folder of markdown in
alphabetical order, which is what you had before.

### Keys it does not understand are kept
Unlike `boundings.yaml`, which drops what it does not recognise, unknown **top-level blocks
are preserved verbatim and written back**. Stage 6's compile presets will live in this file,
and ADR-004's rule is that an older AML must never silently drop a newer one's settings. A
test writes a `presets:` block through a full read-modify-write cycle and asserts it survives.

### Per-item metadata is front matter
"Per-item metadata synced with front matter" resolves the same way: a document's synopsis,
label and status are keys in **the document's own front matter** (`synopsis`, `label`,
`status`), not rows in the manifest. They are legible in the file, in the Properties panel,
and to anything else that reads markdown — and there is nothing to keep in step.

Writing one goes through `front_matter.rs`, which changes **one line** and leaves key order,
comments, quoting style and block scalars exactly as they were. Reformatting someone's front
matter because they typed a synopsis would be a silent rewrite of their file.

### Words come from the index
`Index::cards_under(prefix)` answers one query per Project for every note's word count and
its three card properties, in the same spirit as `types_by_note`: a hundred-scene book is a
hundred round trips otherwise. A Folio still indexing shows zeroes rather than failing —
the Binder's order and structure come from the files, which are always there.

After a card is written, the command overlays that one row with what it actually wrote, so
the screen does not wait for the watcher to re-index before showing what you just typed.

**Dependencies:** none added.

## Acceptance criteria
- [x] The manifest round-trips one item per line, reads a hand-written file, refuses a target
      that is not a number and a deadline that is not a date, and drops `..` out of a path
      (Rust tests `project.rs`).
- [x] A block this version does not model survives a read-modify-write (Rust test).
- [x] The Binder is the folder reconciled against the manifest: listed items in the manifest's
      order, unlisted ones after them in the Browser's order, missing ones ignored on screen
      and kept in the file, and an excluded part excludes everything under it (Rust tests).
- [x] Front matter is edited one line at a time: setting a key leaves every other line alone,
      an empty value removes it, removing the last key removes the block, a nested key of the
      same name is not the one that changes, and only what YAML would misread is quoted
      (Rust tests `front_matter.rs`).
- [x] A card's properties are written to the note and not to the manifest (Rust test).
- [ ] **Gate 5:** recreate a real manuscript as a Project (`docs/qa/stage-5.md` §1, §2).

## Not in this work package
- **Compile presets.** The file keeps them if something else writes them; nothing does until
  Stage 6.
- A Binder tree that differs from the folder (Scrivener's model). Deliberate — see above.
- Research folders, `.bib` files, or anything else in the Project folder that is not a folder
  or a `.md`: they are not Binder items. The Research panel is WP-5.6.
