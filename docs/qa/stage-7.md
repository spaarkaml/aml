# Stage 7 — Manual QA script

Only WP-7.3 (link graph) is built. Record results in
`docs/qa/results/YYYY-MM-DD-stage-7.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | Open a real Folio and press **⌘⇧G** | The whole Folio, drawn within a second or two; the count underneath matches the note count you expect; notes nothing links to are there too, out at the edges | ☐ |
| 2 | Look at the Boundings | Each Bounding is a recognisable clump in its own colour, and the key names every colour on screen and no others | ☐ |
| 3 | Close it and open it again | The same picture. A graph that rearranges itself each time is one you have to re-read | ☐ |
| 4 | Click a note; then reopen the graph and double-click one | Click opens the note and closes the graph; double-click re-centres the graph on that note without leaving | ☐ |
| 5 | Switch to **Around this note** and change Steps from 1 to 3 | One step shows what it links to *and what links to it*; three shows more. The count underneath says which note it is around | ☐ |
| 6 | Drag a note somewhere, then let the rest settle | It stays where you put it; everything else arranges itself around it | ☐ |
| 7 | Open the **Graph** section in the Context panel while writing | The open note and its immediate neighbours; a note connected to nothing says so rather than drawing a lonely dot | ☐ |
| 8 | Switch between Paper and Ink with the graph open | The drawing repaints in the new palette — no dark-on-dark, no stale colours | ☐ |
| 9 | *(If the Folio is large)* Open the whole-Folio graph on a Folio of more than 1200 notes | It says it is drawing the most connected of however many, and still moves smoothly | ☐ |
