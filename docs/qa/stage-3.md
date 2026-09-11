# Stage 3 — Manual QA script

Run against your real Folio on the Mac (and later the PC). Record results in `docs/qa/results/YYYY-MM-DD-stage-3.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | *(WP-3.1)* Write for ≥ 1,500 words with Focus (sentence) and Typewriter both on | No stutter as the page scrolls; the line you type stays put; dimming keeps up with the caret and never hides what you are writing; zero blockers logged — this is Quality Gate 3's first line | ☐ |
| 2 | *(WP-3.1)* In a note with citations and abbreviations (`p. 41`, `e.g.`, `Fig. 2`, a decimal), move the caret sentence by sentence in Focus: Sentence | Each sentence lights as a whole; abbreviations do not split it; a sentence ending in an initialism may run on into the next, which is the known trade | ☐ |
| 3 | *(WP-3.1)* ⌘⌥Z into Zen, write a paragraph, ⌘K to run a command, then Escape | Nothing but the page; the hint fades; the palette still opens; Escape restores the panels exactly as they were pinned | ☐ |
| 4 | *(WP-3.1)* Set Focus and Typewriter on the Mac, then open the same Folio on the PC | The modes are per device: the PC keeps its own settings | ☐ |
| 5 | *(WP-3.2)* ⌥⌘, → change three colours in Ink, a face and the measure; quit; open the same Folio on the PC | **Gate 3's third line.** The colours and type arrived through `.aml/config.yaml`; the file is readable and one setting per line | ☐ |
| 6 | *(WP-3.2)* Turn on *Keep this machine's own appearance*, change the measure, then turn it off | The device's setting applies while it is on and the Folio's returns when it is off; nothing you did on this machine reached the Folio | ☐ |
| 7 | *(WP-3.2)* Push a text colour until the contrast warning appears, then use the per-token reset | The warning is honest (below 4.5:1 reads "too low"); reset returns ADR-010's own colour, not a copy of it | ☐ |
| 8 | *(WP-3.2)* **Ink palette approval** — outstanding since Gate 0. Look at Ink on screen with a real note open | The palette is what you want, or you note the changes here | ☐ |
| 9 | *(WP-3.0)* **The refresh, on screen.** Open the Overview, a real note in Desk layout, both panels, the palette (⌘K), the Shortcuts dialog (⌘/) and Appearance (⌥⌘,) in Paper | It looks like a Mac app: one type hierarchy, consistent radii, panels that float rather than sit in boxes, drawn icons everywhere (no ◧ ↺ ✎), and every button with a hover and a focus ring. Compare against `docs/qa/screens/stage-3-*-paper.png` | ☐ |
| 10 | *(WP-3.0)* Tab through the whole shell with the keyboard, then turn on **Reduce Motion** in System Settings → Accessibility and reopen the panels | Every control shows a visible focus ring and nothing but the editor surface gets one; with Reduce Motion on, no panel or sheet animates | ☐ |
| 11 | *(WP-3.0)* In Appearance, edit a colour, then press its reset | The colour that comes back is ADR-013's, not ADR-010's old Paper value (`#f5f5f7` background, `#d8d8dd` muted, `#e8e8ed` highlight) | ☐ |
| 12 | *(WP-3.10)* ⌘, → set the Daily notes folder to something else; press *Open today's note*; then open the same Folio on the PC and do the same | **Gate 3's fourth line.** The note lands in the folder you named, under its year; the PC writes to the same folder, and both calendar strips show the same days | ☐ |
| 13 | *(WP-3.10)* In Settings, type a folder that leaves the Folio (`../elsewhere`) | It is refused on screen and nothing is written; correcting it saves | ☐ |
| 14 | *(WP-3.10)* With a note open, click Home in the breadcrumb, then ⌘[ | The Overview appears and your tabs are all still open; ⌘[ returns you to the note you were writing | ☐ |
| 15 | *(WP-3.10)* Scroll a long Folio tree to the bottom, and switch to Search | The week and *Open today's note* stay in reach at the foot of the Browser however far you scroll; the tags are at the foot of the Search view | ☐ |
| 16 | *(WP-3.3)* In Settings → Note types, give three types an icon and a colour; open the same Folio on the PC | They arrived through `.aml/types.yaml`; the file is readable, one field per line, and holds only the three you changed | ☐ |
| 17 | *(WP-3.3)* In a real chapter note, change its type with the picker, then add a field the type offers | The note's own `type:` changed (check the YAML view); the Browser shows the new mark; the added property is plain YAML | ☐ |
| 18 | *(WP-3.4)* Set a daily goal, then write for a real session across two or three notes | **Gate 3's fourth line.** The ring counts what you wrote, not what you opened; switching notes adds nothing; deleting takes it back off; the figure survives a restart | ☐ |
| 19 | *(WP-3.4)* Give a real chapter a target and a deadline a fortnight out | The pace reads as words a day and falls as you write; it disappears when you pass the target; `target_words` and `deadline` are ordinary properties in the file | ☐ |
| 20 | *(WP-3.4)* Meet the goal two days running, then look before writing on the third | The streak says 2 in the morning and 3 once the day is met — it does not collapse just because today has not started | ☐ |
| 21 | *(WP-3.7)* Open a real chapter and click the word count | The figures match the status bar; the sections are your headings with the subsection words counted in; the readability band is believable for the prose | ☐ |
