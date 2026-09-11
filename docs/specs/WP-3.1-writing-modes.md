# WP-3.1 — Focus, Typewriter and Zen
**Stage:** 3 · **Depends on:** 1.2, 1.5 · **ADRs:** 003, 004 · **Sessions:** 0.5

## Goal
Three ways to quieten the app around the sentence you are writing, each independent and each remembered per device.

## Design
- **Per device, by decision** (ADR-004): the same Folio is read on a laptop and a desk monitor, and they do not want the same thing. `features/writing/store.ts` persists `aml.writing`; nothing about these modes reaches the Folio.
- **Focus** has three settings — off, paragraph, sentence — cycled by one command, because a toggle cannot express three states and three commands would crowd the palette. Dimming is a ProseMirror decoration: every top-level block except the caret's gets `aml-dim`, and in sentence mode the parts of the caret's own block outside the current sentence get it too. Nothing here can change a byte of the note.
- **Sentence boundaries** (`features/writing/sentences.ts`) end on `.`, `!`, `?` or `…` followed by whitespace — *unless* the word in front is a single letter, a known abbreviation, or already carries an internal dot. That keeps "3.5", "04 Methods.md", "e.g.", "p. 41" and "Fig. 2" in one piece, which matters in a thesis. The trade is that a sentence genuinely ending in "U.S." runs into the next one: the dimmer occasionally reaches too far, which is the right way for a reading aid to be wrong.
- **Offsets line up with the document** because the caret's block is flattened with `textBetween(…, "", " ")`: an inline leaf (a tag, a wiki link) stands in as one character, matching its `nodeSize` of 1, so a text offset plus the block's start position is a document position.
- **Typewriter** keeps the caret's line at 42 % of the page height, adjusting the scroll container after the DOM has been updated (`coordsAtPos` measures the old layout otherwise). The page gains 55vh of bottom padding so the last line can reach that height.
- **Zen** renders the editor and nothing else — no top bar, status bar or panels — without touching the layout, so leaving it restores exactly what was pinned. Escape leaves, a hint says so for four seconds, and the palette and Quick Open stay mounted because in Zen they are the only way to reach anything.
- **Status-bar chips** appear only while a mode is on, and clicking one changes or clears it: the modes are visible when they matter and invisible when they do not.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Sentence ends are found at terminators followed by a gap; decimals, file names, abbreviations and initialisms stay whole; a caret in the gap belongs to the sentence that follows; empty and out-of-range input behave (unit tests `features/writing/sentences.test.ts`).
- [x] E2E: Focus dims every block but the caret's, then every sentence but the caret's; the chip cycles and the setting survives a reload (`e2e/writing.spec.ts`).
- [x] E2E: Typewriter adds the run-off room and leaves the caret between 20 % and 65 % of the page after a dozen typed lines.
- [x] E2E: Zen hides the bars and panels, keeps the palette, and Escape brings everything back.
- [x] `⌘⌥D` / `⌘⌥T` / `⌘⌥Z` are covered by the WP-2.9 suite, which presses every bound shortcut and checks what ran.
- [ ] On your Folio: a ≥ 1,500-word session in Focus + Typewriter with no blockers — Quality Gate 3's first line (`docs/qa/stage-3.md` §1).

## Lessons recorded
- A Playwright `.click()` in the editor does **not** move ProseMirror's caret synchronously; reading the selection straight afterwards reports the one the editor started with. `e2e/helpers.ts` already had `clickEndOf` for this, and this spec adds `caretInProse`, which polls until the editor agrees. Any test that clicks into prose and then presses keys needs one of the two.
- The centre of a prose paragraph is often a link. Click near the start of the line, or the test opens a note instead of placing a caret.

## Not in this work package
- Hiding the status bar in Focus Mode (the open question in `05-UX-ALTERNATIVES.md`): Zen covers the "hide everything" case, and a hover-reveal bar is worth deciding on screen rather than in a spec.
- A configurable typewriter line and dim strength — both want the Appearance settings of WP-3.2 rather than their own controls.
