# WP-7.3 — Link graph
**Stage:** 7 (pulled forward) · **Depends on:** 2.1, 2.2, 2.8 · **ADRs:** 001, 004, 010, 011, 013 · **Sessions:** 1

## Goal
What points at what, for the whole Folio or around one note, with Boundings as the clusters.

## Design

### The graph is derived, so Rust builds it
`index/graph.rs` reads the index and nothing else — no file is opened to draw a picture.
Every link is resolved through **`Index::resolve`**, the same one rule backlinks and rename
propagation use, so a graph can never disagree with a backlinks panel about what a link means.
Resolution is the expensive part, so it goes through a memo keyed on the link's folder, its
text and its kind: a Folio repeats its targets far more often than not.

Repeated links between the same two notes are **one edge carrying a weight**, not four lines
on top of each other — the spring is shorter for it and the line heavier.

A Folio-wide graph includes the notes nothing links to. A note with no links is exactly what
someone opens a graph to find, and leaving it out would be answering a different question.

A focused graph walks out `depth` steps **in both directions**. A note that is only ever linked
*to* — most reference notes — would otherwise be a graph of one dot.

Past `MAX_NODES` (1200) a graph stops being a picture and becomes a texture, so a larger Folio
draws its most-connected notes and says so. Ties break on path, so the same Folio always draws
the same graph.

### Clusters are Boundings
A note's cluster is the **first Bounding holding it, in the order they are written** in
`boundings.yaml`. A note can be in several and the picture has to put it somewhere; the order
the user wrote is the only answer that is theirs rather than ours. Cluster colours are the
Bounding's own colour (ADR-010), and the key names only the Boundings that are actually on
screen — a key that names a colour the graph is not using is worse than no key.

### The layout is arithmetic, and it is tested
`features/graph/layout.ts` holds four forces and no drawing: repulsion (against a grid, since
a thousand notes is half a million pairs a frame otherwise), springs along links, gravity
towards each Bounding's own centre, and a push between Boundings so they settle as separate
blobs rather than as one even spread with the right neighbours. It cools, so it settles rather
than shivering.

Because it is pure, the claim the WP rests on is a test: notes in the same Bounding end up
closer to each other than to another Bounding's, *with no links between any of them*.

The seed is deterministic — a golden-angle spiral, each Bounding starting in its own arc — so
a Folio lays out the same way every time it is opened. A graph that rearranges itself between
openings is one you have to re-read from scratch each time.

**Reduced motion** gets the finished picture rather than no picture: the same layout, settled
in one go instead of in front of you.

### Canvas, not SVG
A thousand notes is three thousand DOM nodes for React to reconcile sixty times a second while
the layout settles. The canvas reads its colours out of `tokens.css` through
`getComputedStyle` and repaints when `data-mode` changes or the OS flips, so ADR-013 still
holds: no colour is written in this feature's own code.

### Two ways in
- **⌘⇧G** opens the screen: whole Folio or around this note, with a depth of 1–3. Click a note
  to open it, double-click to re-centre the graph on it, drag one to put it somewhere and it
  stays there.
- **The Context panel** carries the open note's own corner, one step out, closed by default.
  Two steps in a box that size is a smudge.

Which scope and depth you like is per device (ADR-004). The graph itself is never persisted:
it is derived, and it is rebuilt from the index every time it is opened.

### How it looks (redrawn 2026-09-14)
The first drawing took its look from Obsidian: flat dots, straight grey lines, a legend line
under a framed canvas. Bryce's brief for the redraw was Apple's hand, so the graph is drawn as
a **map** — the thing a person would sketch — rather than a physics demo.

- **Territories.** A Bounding is a tinted region: every member's circle goes into one canvas
  path, which fills as a union (so overlaps do not darken), in two layers for a soft edge. The
  Bounding's name sits over the top of it, and fades out as you zoom right in.
- **Beads.** A note is its colour inside a ring of the page, so it sits visibly on its lines;
  a note in no Bounding is an open ring. The focus note is larger with an accent halo, and a
  focused graph quietens notes by depth (1, 1, 0.7, 0.48).
- **Curves.** Links are quadratic curves bent a tenth of their length, coloured by the
  Bounding when both ends share one; a pair in both directions bends to opposite sides.
- **Names by rank.** Labels are placed in order of degree and skipped where they would collide
  with one already placed (a Bounding's name reserves its room first), each with a halo of the
  ground. Zoomed out you read the landmarks; zooming in makes room.
- **Hover** eases the rest back and shows a frosted card (DOM, positioned by the draw loop, no
  React render per frame): title, Bounding, links, words, and the two clicks.
- **The camera follows the layout** until you pan or zoom, easing to `fitView` each frame; the
  first ticks run before the first frame, so the picture arrives rather than exploding. The fit
  is capped at 1.5× so a small graph stays a map.
- **Glass controls** over an edge-to-edge canvas with a faint dot grid: scope and steps at the
  top, the key (hover a Bounding to bring it forward) bottom left, zoom and *Show everything*
  bottom right.
- **Pointer.** Two-finger scroll pans and a pinch zooms (the wheel listener is non-passive so
  a pinch never zooms the window); a notched mouse wheel zooms. Click opens; **⌥-click** (or a
  double-click, where the first click does not close the view) centres the graph on a note.
- One render loop drives the layout, the camera, the hover and the entrance, and stops when
  none is moving. Canvas never parses `color-mix()`: dimmer ink is the text token at a lower
  alpha. Reduced motion still gets the settled picture, with no easing.

**Dependencies:** none added. The force layout and the renderer are ours — a graph library
would have brought its own DOM, its own colours and its own idea of a theme.

## Acceptance criteria
- [x] The Folio graph includes notes nothing links to; a focused graph walks both ways and
      stops at the depth asked for (Rust tests, `index/graph.rs`).
- [x] Four links between two notes are one edge of weight 4; a self-link is not an edge.
- [x] A note in two Boundings takes the one written first; the key names only what is drawn.
- [x] An edge is drawn only when both of its notes are.
- [x] Unit: the same Folio seeds identically; linked notes settle closer than unlinked ones;
      more links pull harder; **a Bounding gathers with no links at all**; a dragged note stays
      where it was put (`features/graph/layout.test.ts`).
- [x] E2E: ⌘⇧G draws the Folio, names its Boundings and counts what it drew; clicking a note
      opens it; "around this note" finds the note that links *to* it; the Context panel says
      when a note is connected to nothing; the zoom controls and *Show everything* keep the
      graph clickable (`e2e/graph.spec.ts`).
- [ ] **Gate 7:** a real Folio's graph is legible and its clusters are the ones you would draw
      by hand (`docs/qa/stage-7.md` §1–§7).
