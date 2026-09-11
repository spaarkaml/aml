# Stage 3 — Manual QA script

Run against your real Folio on the Mac (and later the PC). Record results in `docs/qa/results/YYYY-MM-DD-stage-3.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | *(WP-3.1)* Write for ≥ 1,500 words with Focus (sentence) and Typewriter both on | No stutter as the page scrolls; the line you type stays put; dimming keeps up with the caret and never hides what you are writing; zero blockers logged — this is Quality Gate 3's first line | ☐ |
| 2 | *(WP-3.1)* In a note with citations and abbreviations (`p. 41`, `e.g.`, `Fig. 2`, a decimal), move the caret sentence by sentence in Focus: Sentence | Each sentence lights as a whole; abbreviations do not split it; a sentence ending in an initialism may run on into the next, which is the known trade | ☐ |
| 3 | *(WP-3.1)* ⌘⌥Z into Zen, write a paragraph, ⌘K to run a command, then Escape | Nothing but the page; the hint fades; the palette still opens; Escape restores the panels exactly as they were pinned | ☐ |
| 4 | *(WP-3.1)* Set Focus and Typewriter on the Mac, then open the same Folio on the PC | The modes are per device: the PC keeps its own settings | ☐ |
| 5 | *(WP-3.2)* ⌘, → change three colours in Ink, a face and the measure; quit; open the same Folio on the PC | **Gate 3's third line.** The colours and type arrived through `.aml/config.yaml`; the file is readable and one setting per line | ☐ |
| 6 | *(WP-3.2)* Turn on *Keep this machine's own appearance*, change the measure, then turn it off | The device's setting applies while it is on and the Folio's returns when it is off; nothing you did on this machine reached the Folio | ☐ |
| 7 | *(WP-3.2)* Push a text colour until the contrast warning appears, then use the per-token reset | The warning is honest (below 4.5:1 reads "too low"); reset returns ADR-010's own colour, not a copy of it | ☐ |
| 8 | *(WP-3.2)* **Ink palette approval** — outstanding since Gate 0. Look at Ink on screen with a real note open | The palette is what you want, or you note the changes here | ☐ |
