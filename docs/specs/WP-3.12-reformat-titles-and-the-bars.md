# WP-3.12 — Reformatting, note titles, and the two bars
**Stage:** 3 · **Depends on:** 1.2, 1.5, 3.0 · **ADRs:** 003, 011, 013 · **Sessions:** 1

Four things asked for together: a way to make pasted markdown into formatting, a note that
names itself from its own title, a sync sheet that is not ugly, and a top bar that holds still.

## 1 · Reformat a note from the markdown in it

### The problem
Pasting markdown as plain text leaves it as text. ProseMirror's own plain-text paste splits the
clipboard into one paragraph per block and one hard break per line, so `## A section` is a
paragraph that happens to start with two hashes. (Tiptap's paste rules do catch inline syntax:
`**bold**` arrives already bold. It is the block syntax — headings, lists, quotes, tables,
fences — that lands as text.)

### The command
**Reformat Note from Markdown**, in the palette and in the editor's right-click menu. No
shortcut: it is an occasional repair, not something to lean on, and the editor's keys are
Tiptap's.

`features/editor/reformat.ts` is a pure pass over the ProseMirror document:

- It gathers **runs of consecutive paragraphs that hold nothing but unmarked text and hard
  breaks**. A paragraph with a mark, an image, a wiki link or anything else in it is already
  formatted, so it is passed through untouched along with every block that is not a paragraph.
- A run is turned back into source — a blank line between paragraphs, a single newline where
  one block continued (two bullets, two quote lines), which is what keeps a pasted list tight
  rather than loose — and parsed with the ordinary `markdownToDoc`. So a highlight, a wiki
  link or a table in the pasted text is read exactly as it would be from a file.
- A run is only reparsed if it **looks like markdown** (a heading, a list, a quote, a fence, a
  rule, a table row, a link, a code span, bold or a highlight) and the parse actually comes out
  different. A note with nothing to reformat is left alone and never dirtied.
- A run that does not start the document is parsed with a blank line in front of it: front
  matter is a property of the top of a file, and `---` anywhere else is a thematic break.
- A blank paragraph at the end of a run is put back, because that is where the caret was.

It is applied with Tiptap's `setContent`, so it is **one step in the undo history** and the
ordinary debounced save writes the canonical markdown.

### Not in this work package
WP-3.6 (paste intelligence) is still the real answer for Word and the web: cleaning HTML on
the way in, and paste-as-plain. This is the repair for what has already landed, and for text
that arrives as text.

## 2 · A note names itself from its title

A new note is `Untitled.md` until it is called something. If the first block in it is a
level-one heading, that is the note's name.

- `autoTitle.ts` is three pure functions: `isAutoNamed` (does the file still wear `Untitled`,
  `Untitled 2`, …), `headingTitle` (the text of a level-one heading at the top, front matter
  skipped) and `fileNameFor` (illegal characters out, whitespace collapsed, no leading dot, no
  trailing dot or space, Windows' reserved device names refused, 80 characters at most).
- `useAutoTitle.ts` watches the open note and renames it through `useFolioStore.rename`, so
  links to it are rewritten, the tab follows and the Browser refreshes — the same path as
  renaming by hand. It waits for the note to be **saved** and for the title to have stood
  still for two seconds, so the file is not renamed to every prefix of a heading as it is
  typed, and it does nothing while the Browser's own inline rename is open on that note.
- **A note that has been named is never renamed from its heading.** Once the file is not
  `Untitled` any more the feature is done with it for ever — the name is the user's.
- The name is taken through `freeName`, so an existing `Thesis outline.md` gives
  `Thesis outline 2.md` rather than a collision.

## 3 · The NAS sync sheet

It was the one dialog that had not had the ADR-013 treatment: a hairline across the sheet
between every step, outlined buttons, boxed errors — and, as it turns out, **no padding at
all**. `.panel` asked for `var(--aml-space-5)`, which does not exist: a `var()` that does not
resolve throws the whole declaration away, so the panel had been flush to its own edge since
the refresh.

It is now the same card as Settings and Appearance: the scrim token, a flex column with
rhythm, section headings in quiet caps, states as filled tiles rather than boxed rows, inputs
and buttons at `--aml-row`, a tinted error rather than a bordered one, and one rule in the
whole sheet — above the footer, which is a different region.

A unit test in `tokens.test.ts` now fails any stylesheet that names an `--aml-` token that
`tokens.css` does not define (bar a handful set at runtime by Appearance, and `var()` calls
that carry a fallback). That is the class of bug, not just this instance of it.

## 4 · The path bar

The breadcrumb used to share the top bar with the tabs, which meant its width changed with
every note — `Writing › Inbox` against `Writing › Thesis › chapters › 03 Influence networks` —
and shunted the whole row of tabs sideways on every switch.

The trail now has a line of its own under the tabs: `.pathbar`, a `--aml-row` grid row between
the top bar and the body. The tabs start at the same place whatever is open, and the trail has
room for the Folio's name, which used to be hidden for screen readers only.

Zen was given the grid row it needed at the same time (`.root[data-zen]` is one row, not four):
it had been laying the page out in the height of a top bar that zen does not render.

**Dependencies:** none added.

## Acceptance criteria
- [x] A pasted heading, list and quote become a heading, list and quote on the command, and
      the file gets `## …`, `- …`, `> …` (`e2e/reformat.spec.ts`).
- [x] A note with no pasted markdown in it is not changed and not dirtied; already-formatted
      text is never touched (unit tests + e2e).
- [x] The reformat is one undo (`e2e/reformat.spec.ts`).
- [x] An `Untitled` note is renamed from its `#` title, file and links included; a note the
      user named is not; a title with nothing usable in it leaves the note Untitled
      (`e2e/autotitle.spec.ts`, `src/features/editor/autoTitle.test.ts`).
- [x] No stylesheet names a token that does not exist (`src/app/tokens.test.ts`).
- [x] Switching between two notes with trails of different lengths does not move the tabs, and
      the trail sits below them (`e2e/tabs.spec.ts`).
- [ ] **Gate 3:** the four manual checks in `docs/qa/stage-3.md` §29–§32.

## Not in this work package
- **A toolbar button for the reformat.** It belongs with the note's other whole-file actions —
  the palette and the right-click menu — not in the chrome you look at all day.
- **Renaming from a changed title.** Only the first title names the note. Keeping a file name
  in step with a heading for ever would move files under you every time you edited a title.
- **Freezing tab widths while the pointer is in the strip** (what browsers do when you close
  several tabs in a row). Tabs here are a fixed width until the strip overflows, so there is
  little to freeze; it can come back as a complaint.
