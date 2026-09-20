# WP-3.11 — Highlighting
**Stage:** 3 · **Depends on:** 1.2, 3.0 · **ADRs:** 003 (amendment proposed), 010, 013 · **Sessions:** 1

## Goal
Mark a phrase in yellow, blue, green or orange, the way you would run a highlighter over a
printed page — and have it still be a plain markdown file afterwards.

## Design

### The syntax: `==phrase==` and `==phrase=={colour}`
```markdown
The part that matters is ==this one==, and the part to check is ==that one=={blue}.
```

`==…==` is the highlight syntax the rest of the world already writes: Obsidian, Pandoc's
`mark` extension, Quarto, Discourse and most "extended markdown" renderers. A note written in
AML therefore reads as a highlighted note anywhere else, and a note written in Obsidian
arrives here already highlighted. Yellow — far and away the common case — is the bare form,
so the majority of highlights in a Folio are exactly what everyone else writes.

The colour rides in a brace immediately after the closing fence. A renderer that does not know
it prints six harmless characters next to the marked phrase; it never swallows a sentence, and
it cannot be mistaken for a link, a tag or an attribute list.

**Why not `<mark class="blue">…</mark>`.** Inline HTML is valid markdown too, and it was the
first candidate. It loses on one point that matters here: it puts two whitespace-separated
tokens around every highlighted phrase, and AML reads the *file* as words —
`index::extract` counts them for the word count, Goals and Statistics, and it is the file that
search snippets are cut from. Highlighting a sentence would quietly add two words to your day's
count and put tag soup in your search results. A highlight must not cost you words.

**Why not a Pandoc bracketed span (`[phrase]{.blue}`).** `[phrase]` is a link reference to
every CommonMark parser, including ours; the file would parse differently in AML than in
anything else, which is the opposite of the point.

### Found in the tree, not with a regex
What is highlighted is ordinary markdown — `==**this**==` is bold inside a highlight, and a
`[[wiki link]]` inside one is still a link — so the fences are found **among the phrasing
children of a parent**, after parsing, rather than by a pass over the source text. The opening
`==` must be followed by something other than a space and the closing `==` preceded by one, the
same flanking rule CommonMark uses for `*`, which is what keeps `2 == 2` out of it. Everything
between the two fences, whole inline nodes included, becomes the children of a `highlight` node.

The pass runs **before** the wiki-link/tag pass, because that one replaces the very text nodes
the fences live in.

### Escaped fences
`\=\=not a highlight\=\=` has to survive, and by the time the tree exists the backslashes are
gone: a parsed text node holds the same `==` either way. So before the scan, every `=` that
came from an escape in the source is swapped for a NUL — a character CommonMark guarantees no
parsed text can contain, since it replaces a literal one with U+FFFD — and swapped back
afterwards. The mapping is derived from each text node's own source range, and is used only
when the walk reproduces the node exactly; anything it cannot account for (character
references) is left alone rather than guessed at.

The escaper is the other half of that: `==` is written `\=\=` where one could actually open or
close a highlight, and left alone where it could not, so prose that compares two things keeps
its spaces and its readability.

### In the editor
A `highlight` mark with one attribute, `colour`, rendered as `<mark data-colour="blue">`. A
`<mark>` pasted in from a browser arrives as a highlight, and the four tones are tokens in
`tokens.css` keyed off the attribute (ADR-013), not values in the extension.

The selection toolbar grows one marker button wearing the colour the selection already has:
click it on unmarked text to open the four swatches, click it on marked text to clear.
Toggling to the colour that is there clears it; toggling to another recolours — which is what
a row of four swatches should feel like. **⌘⇧Y** toggles yellow. (⌘⇧H is Home, and ⌥⌘H is
macOS's own Hide Others.)

### Colour
Four background tokens per mode. They are backgrounds only — the text on them stays
`--aml-text` — and `pnpm contrast` holds every one of them to 4.5:1 against it, in Paper and
in Ink. Paper's are the pale tones of a real highlighter; Ink's are deep, desaturated versions
of the same four, because a fluorescent yellow behind white text at night is unreadable.

**Dependencies:** none added.

## Amendment proposed to ADR-003
ADR-003 lists the dialect as GFM + front matter + wiki links + footnotes + citations + Mermaid
fences. This adds `==highlight==` to that list. It is an addition, not a change: nothing that
parsed before parses differently, the corpus proves the round trip, and escaped fences still
come back as text. **Awaiting Bryce's yes** before the ADR itself is edited.

## Acceptance criteria
- [x] `==a==`, `==a=={blue}` and the other two colours parse to a `highlight` node and come back
      byte-identical (unit tests `lib/markdown/markdown.test.ts`).
- [x] Marks, links, wiki links and tags all survive inside a highlight (unit tests).
- [x] `2 == 2` is not a highlight, and `\=\=not marked\=\=` round-trips as text
      (unit tests, `lib/markdown/escape.test.ts`).
- [x] The corpus file `inline/highlights.md` is idempotent and holds no Raw nodes (corpus test).
- [x] Every tone clears 4.5:1 against the text in both modes (`pnpm contrast`).
- [x] E2E: the toolbar marks a phrase and the file gets `==fences==`; a colour is written as its
      own fence and is still that colour after the note is closed and reopened; the shortcut
      toggles a highlight off and leaves the text alone (`e2e/highlights.spec.ts`).
- [ ] **Gate 3:** highlight in a real note, check it in Obsidian on the NAS copy, and check the
      word count did not move (`docs/qa/stage-3.md` §23).

## Not in this work package
- **More than four colours.** Four is a set you can tell apart at a glance and remember what
  you meant by. A palette would make the marks decorative rather than meaningful.
- **Named meanings** ("quote", "check this"). The colour is yours to use however you like; if
  it turns out you always mean the same thing by green, a legend is a later feature.
- **A highlight index** — a panel listing every marked passage in the Folio. It would be a good
  feature and it is a different one; search already finds `==`.
- **Highlighting inside a code block.** Code is verbatim; a fence inside it is text.
