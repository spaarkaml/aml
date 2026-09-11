# WP-3.7 — Statistics
**Stage:** 3 · **Depends on:** 2.6, 3.1 · **ADRs:** 013 · **Q:** 19 · **Sessions:** 1

## Goal
How long the note is, how hard it reads, and where the words actually are.

## Design

### One rule about what a word is
Every figure counts the same text the status bar counts — Q19's rules, from
`lib/wordcount.ts`: front matter, code blocks and HTML comments are not prose; headings,
lists, tables and quotes are. A second counter with its own opinion would be worse than
either being wrong, so `proseText` mirrors `countWords`' own switch rather than re-deriving
it, and the e2e asserts the panel's figure against the status bar's.

### A screen, not a panel section
The Context panel already carries Outline, Properties, Goals and Backlinks. The per-heading
table wants width, and none of this is wanted *while* writing — it is what you look at when
you stop. So: a modal, opened by clicking the word count in the status bar (the figure you
were already looking at when the question occurred to you) or from the palette.

### The figures
Words, characters, characters without spaces, sentences, paragraphs and reading time.

**Sentences are counted per block**, reusing Focus Mode's `sentenceEnds` — the same reading
aid, so the two never disagree — with a floor of one per block. A heading or a line with no
full stop is one sentence, not none; without the floor, a note of headings would read as
having no sentences and every ratio built on it would divide by zero.

### Readability
Flesch reading ease and Flesch–Kincaid grade, both from the same syllable estimate (the usual
vowel-group heuristic). **Below twenty words there is no number at all** — a grade level
computed from a sentence and a half is not a measurement, and printing one would invite
trusting it. The band ("Plain English", "Difficult") leads and the two raw figures follow,
because the band is the part worth acting on.

### Where the words are
Each heading with the words in its section, **its subsections included** — the number that
answers "how long is chapter three". The definition matches the Outline's, so the two panels
agree about what a section is, and depth collapses skipped levels the same way. Anything
written before the first heading is reported under a blank row, and only when there is some.
A bar against the longest section, because which chapter has run away with itself is easier
to see than to read.

**Dependencies:** none added.

## Acceptance criteria
- [x] Words, characters, sentences and paragraphs count the prose, with front matter, code
      blocks and comments excluded and headings included (unit tests `features/stats/stats.test.ts`).
- [x] A block with no full stop counts as one sentence; an empty note is all zeroes rather
      than a division by nothing (unit tests).
- [x] Readability is null below twenty words, and plain prose scores easier and lower-grade
      than dense prose (unit tests).
- [x] A heading's section includes its subsections, depth collapses skipped levels, and
      content before the first heading is reported only when there is some (unit tests).
- [x] E2E: the word count opens the screen; its figure equals the status bar's; the sections
      are the note's headings; the figures follow unsaved edits; the palette opens it; a
      two-word note says there is too little to measure (`e2e/stats.spec.ts`).

## Lessons recorded
- The first per-section test asserted the chapter's own words and not its subsections', and
  the code was right. Worth noticing which of the two is the specification: "how long is
  chapter three" includes everything under it, and the test was the thing that had to change.

## Not in this work package
- Folio-wide statistics, or statistics per Bounding or Project. The question "how long is this
  note" is answerable now; "how long is the manuscript" needs the Binder (Stage 5), which will
  have the totals in the Outliner where they belong.
- A history chart of counts over time. That is the Goals panel's territory and was declined
  there too (WP-3.4) — the streak is the one number worth carrying.
- Configurable word-count rules. Q19 says "configurable"; nothing has yet wanted a rule other
  than the one in `wordcount.ts`, and a setting nobody changes is a setting to maintain.
