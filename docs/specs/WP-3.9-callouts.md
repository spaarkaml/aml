# WP-3.9 — Callouts as nodes
**Stage:** 3 · **Depends on:** 1.2 · **ADRs:** 003, 013 · **Sessions:** 1

## Goal
`> [!warning] Read this` stops being a monospace Raw chip and becomes what it looks like —
without changing a byte of what is written to disk.

## Design

### Read from the source, not from the tree
mdast parses `> [!note] Title` + `> Body` as a blockquote holding **one** paragraph whose
text is `"[!note] Title\nBody"` — the title line and the first body line joined by a soft
break. Pulling them apart again inside the mdast tree means splitting text nodes around a
newline and re-homing whatever inline nodes straddle it.

So the callout is read from the blockquote's **own source text** instead: strip one level of
`> `, take the first line as the head, and everything after it is the body. Both halves are
then markdown in their own right and are parsed as such — which is why emphasis in a title
survives, a `[[wiki link]]` in the body is still a wiki link, and a callout nested inside
another becomes a nested callout node for free.

### Written back by hand, on purpose
The body has to sit on the lines **straight after** the head:

```
> [!note] Title
> Body.
```

A stringifier would put a blank `>` line between the head paragraph and the body paragraph,
and parsing *that* back gives a different document from the one written — the round trip
would drift on every save. So a callout serialises through the existing Raw escape hatch with
its lines assembled here, where the exact shape is the feature. Blank lines inside the body
are quoted as a bare `>`, which is what keeps two paragraphs two.

The corpus file `meta/obsidian-callouts.md` moved from `expect: raw` to `expect: lossless`:
every callout in it now comes back byte-identical, which is Quality Gate 3's "callout Raw
count is 0".

### The node
`callout` holds `calloutTitle block+`. The title being a **child node with inline content**
rather than a string attribute is the decision that keeps ADR-003's second rule: a title with
`**emphasis**` in it round-trips as emphasis, and the title is ordinary editable text rather
than something you can only change by editing raw markdown.

`kind` is whatever the file says. An invented kind is kept, not rewritten to one AML knows,
and falls through to the info tone. A callout with no title of its own shows the kind's name
as a placeholder, so a coloured bar is never unexplained — the label is passed down as a CSS
custom property, because ProseMirror puts a trailing `<br>` in every empty textblock and
`:empty` therefore never matches inside the editor.

### Colour
Four tones — info, done, warn, danger — rather than one colour per kind, so a Folio full of
invented kinds still reads sensibly. Info reuses `--aml-primary`; the other three are new
tokens in `tokens.css`, and each clears 4.5:1 against the page because a callout's title is
text. That is also why danger has a darker relative of its own rather than borrowing
`--aml-accent`, which ADR-010 says is never text in light mode.

**Dependencies:** none added.

## Acceptance criteria
- [x] A callout is read from its source with kind, fold marker, title and body separated; an
      ordinary quotation is not mistaken for one; a nested callout keeps its nesting
      (unit tests `lib/markdown/callout.test.ts`).
- [x] Whatever is written parses back to the same callout (unit tests).
- [x] The bridge gives a `callout` node with a `calloutTitle` of inline content, emphasis in
      the title survives, a wiki link in the body is still a wiki link, and the markdown comes
      back byte-identical — including with no title, nested, and with an unknown kind
      (unit tests `lib/markdown/markdown.test.ts`).
- [x] The corpus file round-trips losslessly and holds **no Raw nodes** (corpus test).
- [x] E2E: a callout in a file renders as one with no Raw chip; its body and its title are both
      editable and land in the right place in the file; `/callout` inserts one and it is
      written as Obsidian's own syntax (`e2e/callouts.spec.ts`).
- [ ] **Gate 3:** open a real Obsidian Folio full of callouts and check nothing changed shape
      (`docs/qa/stage-3.md` §22).

## Lessons recorded
- `mergeAttributes(HTMLAttributes, …)` renders a node's attributes as HTML attributes, so
  `kind: "note"` arrived in the DOM as a literal `kind="note"` on a `div`. Attributes that are
  presentation rather than data want an explicit `renderHTML` that emits the data attribute —
  or nothing. Found by reading the rendered HTML in the running app, not by a test.
- A round-trip that is stable *and* byte-identical needs the serialiser to know the shape the
  parser will read back. Writing the callout with a blank `>` line between head and body would
  have passed a "parses to the same document" test while rewriting the user's file on the
  first save.

## Not in this work package
- Rendering the layout hint. `[!note|left]` is kept and written back exactly, but the callout
  is laid out the same way whatever the hint says.
- **Folding.** The `-`/`+` marker is parsed, kept and written back, but the editor always
  shows the body. A callout that hides text in the editor is a way to lose track of what you
  wrote; if it is wanted it should be a disclosure the *editor* owns, not a state the file
  dictates on open.
- Icons per kind. ADR-013 keeps interface icons in `icons.tsx` and out of typed characters;
  thirteen more drawn icons for a decorative purpose is not a good trade. Colour and the
  kind's name carry it.
- A picker for the kind. Changing `note` to `warning` today means typing it in the YAML view
  or deleting and re-inserting. Worth a control if it turns out to be a thing you do often.
### A file-rewriting bug found on the way
`> [!note|left]` — Obsidian's layout hint — did not match the old callout pattern, so the block
was an ordinary quotation and the serialiser **escaped its `[` on the way out**, rewriting the
user's file on the first save. The head pattern now takes everything up to the `]`, hints
included, and the whole string is the kind; the label and the tone read the part before the
pipe. It round-trips byte-identically now, and a test pins it.
