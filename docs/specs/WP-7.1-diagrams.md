# WP-7.1 — Diagrams
**Stage:** 7 · **Depends on:** 1.3 (assets), 3.0 (tokens) · **ADRs:** 001, 004, 011, 013 · **Sessions:** 1

**WP-7.2 (canvas notes) is folded into this one by decision (2026-09-13).** One charting
feature, not two. See "What this is not" below.

## Goal
Draw small, deliberate diagrams — psychological formulation, genogram, sociogram, influence
and causal-loop maps — and put them in a note as an ordinary image that stays editable.

## Design

### Why not Mermaid
Mermaid decides the layout. That is fine for a flowchart and useless for the diagrams this is
for: a hot-cross-bun formulation, a causal loop with polarity, a genogram, an influence map —
in all of them **position carries the meaning**, and an auto-layout engine destroys exactly
the thing the drawing is supposed to say. Its house style is also an engineering document's,
which is not what this app looks like anywhere else.

ADR-001 lists Mermaid fences as part of the on-disk dialect. It does not say AML renders them,
so nothing changes there: a Mermaid fence stays an ordinary code fence that round-trips
untouched. No renderer, no insert path, no ADR amendment, and nobody's existing file breaks.

### The file is an SVG that carries its own model
A diagram is written to the note's `assets/` folder as a **complete, standalone `.svg`** and
referenced by an ordinary image link. So it renders in Obsidian, on the NAS, in Quick Look, in
a browser and in a compiled PDF with AML nowhere in the picture — which is the premise of the
whole project, and the reason this is not a private file format with a viewer.

What makes it re-editable is a `<metadata id="aml-diagram">` block holding the model — the
same technique Inkscape and draw.io use. Re-opening a diagram restores what the shapes *mean*
rather than reverse-engineering it from their geometry: an arrow that means "suppresses" comes
back as "suppresses", not as a line that happens to end in a bar.

The model is written **one item per line**, deterministically, so a sync conflict is legible
and a diff shows what moved:

```
aml-diagram 1
size w=720 h=520
group id=g1 shape=circle x=40 y=40 w=300 h=300 tone=slate text="Family system"
node id=n1 kind=self x=140 y=150 w=96 h=96 tone=teal text="Subject"
edge id=e1 from=n2 to=n1 kind=inhibits tone=neutral label="−"
```

Reading is deliberately forgiving: an unknown record, key, kind or tone is ignored or replaced
with a sensible one rather than throwing. A diagram written by a later AML opens in this one as
much of itself as this one understands. An edge whose ends are missing is dropped rather than
drawn into nowhere.

### Colour, and what follows the reader's theme
Structure — text, hairlines, the page — is written as CSS variables with a
`prefers-color-scheme` block, so a diagram drawn in Paper stays legible to someone reading in
Ink. **Tones do not follow the theme**: a colour you chose is part of the drawing, and swapping
it in the dark would be AML editing your diagram behind your back. The file paints its own
background rect, which is what makes that safe — it brings its own paper rather than borrowing
the host's, so it is readable on any background even where the media query never applies.

Inside the editor the same stylesheet is used with `--ink`/`--paper`/`--line` pointed at the
app's tokens, so the drawing follows Appearance while you work on it. No colour is named in
any `.module.css`, so ADR-013 holds (the tone literals live in a `.ts`, as the Corkboard's do).

### One renderer, used twice
`DiagramBody.tsx` draws the diagram, the editor mounts it, and the exported `.svg` is that same
component tree through `renderToStaticMarkup`. A separate export path would be a second
implementation of the same picture, and the two would eventually disagree about something small
that nobody notices until a compiled book looks wrong.

SVG rather than canvas — the opposite of WP-7.3's choice, for the opposite reason. A diagram is
tens of shapes, not the thousand the link graph paints, and SVG is what has to come out at the
end anyway. Text wrapping is arithmetic rather than measured in the DOM, because the exported
file is written without a layout engine: if wrapping asked the browser, the file would not
match what was drawn.

All pointer handling is on the root element with hit-testing in one `pick` function, rather
than a handler per shape. The drawing stays a drawing, and what gets picked first is a list you
can read instead of whatever the DOM happened to stack.

### The symbol set
Thirteen node kinds in three families, chosen for psychological and influence work rather than
for flowcharts:

- **People** — Person (circle), Subject (double circle: the index person), Group (two
  overlapping circles: a household, a faction), Institution (hexagon: an agency, a platform).
- **Mind** — Belief (rounded box), Feeling (ellipse), Behaviour (box), Body (pill). These four
  are the formulation vocabulary.
- **World** — Event (diamond), Channel (parallelogram: a medium of transmission), Message (tag:
  a narrative, a frame), Outcome (double box), Note (no outline: an annotation).

Nine link kinds, because the difference between them is the content of the diagram: influences,
both ways, **suppresses** (bar head, the systems notation for "stops"), tenuous (dashed —
hypothesised rather than established), transmits (heavy), and the three genogram ties — close
(double line), conflict (saw-tooth), cut off (dashed with cross-bars) — plus a plain line. An
edge carries a label, which is where a causal loop's `+` and `−` go.

**Groupings** are the "big circle": a circle or a box drawn behind everything, with a name.
Membership is positional — a group holds whatever is standing in it — and **dragging a group
moves what it holds**, because that is the point of drawing a circle round things.

### How you get to it
- **Right-click in the note → Insert diagram.** Right-clicking an existing diagram offers
  **Edit diagram** instead. The menu stands aside for a misspelled word explicitly rather than
  by plugin ordering, which would silently swallow the spelling suggestions the day somebody
  reorders the extension list.
- `/diagram` in the slash menu and the Command Palette, from the same list.

Editing an existing diagram **overwrites the same file**: the note already points at it, and
writing a new one each time would orphan the old drawing in `assets/` and leave the link
pointing at a stale picture. Two new commands carry that — `asset_read_text` and
`asset_write_text` — both guarded by the same path check as every other asset call, so a note
cannot reach outside the Folio.

### What this is not
No freehand or pen input: by decision (2026-09-13), the sketching half of the old WP-7.2 is not
wanted, and a structured editor is what serves these diagrams. The source text is not exposed
for editing either — the model is a storage format, not a language to write in.

**Dependencies:** none added. React was already here, and `renderToStaticMarkup` is part of it.
A diagram library would have brought its own DOM, its own fonts, its own theme and its own file
format.

## Acceptance criteria
- [x] A diagram round-trips through its own text and through a whole SVG, unchanged
      (`features/diagram/format.test.ts`).
- [x] The model is one line per item; XML metacharacters in a label cannot break the file.
- [x] An unknown kind, tone or link from a later version degrades rather than throwing; an edge
      with a missing end is dropped.
- [x] Every node kind has a path with no `NaN`; a link stops on the shape's boundary, and on the
      ellipse rather than the corner for a round one (`features/diagram/shapes.test.ts`).
- [x] Deleting a node deletes its links; a group's members are the ones standing in it.
- [x] Editing a diagram overwrites one file and leaves nothing orphaned; an asset path cannot
      walk out of the Folio (Rust tests, `folio/mod.rs`).
- [x] E2E: right-click → Insert diagram → place two shapes, join them, choose what the link
      means, insert; the note holds an ordinary `.svg` image. Right-click it → Edit diagram and
      the model comes back. ⌘Z undoes a shape; Escape leaves the note untouched
      (`e2e/diagram.spec.ts`).
- [ ] **Gate 7:** a real formulation and a real influence map are quicker to draw here than on
      paper, and both are legible in Paper and in Ink (`docs/qa/stage-7.md` §10–§16).
