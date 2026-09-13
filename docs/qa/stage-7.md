# Stage 7 — Manual QA script

WP-7.3 (link graph, §1–§9) and WP-7.1 (diagrams, §10–§18) are built. Record results in
`docs/qa/results/YYYY-MM-DD-stage-7.md`.

## Link graph (WP-7.3)

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

## Diagrams (WP-7.1)

| # | Step | Expect | Pass |
|---|---|---|---|
| 10 | Right-click in the middle of a note's prose | A menu with **Insert diagram** — and right-clicking a misspelled word still gives spelling suggestions instead | ☐ |
| 11 | Draw a formulation: a Belief, a Feeling, a Behaviour and a Body, joined into a loop | Clicking a shape in the left rail then the page places it where you pointed; each shape is the right outline; the labels are the words you typed | ☐ |
| 12 | Select a shape and drag from one of its four dots onto another | A link appears and *stays attached* when you then drag either shape around | ☐ |
| 13 | Set one link to **Suppresses** and give another the label `−` | The bar head and the sign are drawn, and they are still there after saving and re-opening | ☐ |
| 14 | Draw a **Circle** grouping around three shapes, name it, then drag the circle | The three shapes move with it; a shape outside it does not | ☐ |
| 15 | Press **Insert** | The editor closes and the drawing is in the note as an image; the markdown holds a plain `![…](assets/….svg)` link (check the file on disk) | ☐ |
| 16 | Right-click the drawing → **Edit diagram**, change something, **Save** | It re-opens with everything as it was, including what each link *means*; saving leaves **one** file in `assets/` — not a second copy | ☐ |
| 17 | Open the same note's `assets/….svg` in Preview, a browser, and on the NAS | It renders as a normal image everywhere, with its own background — nothing missing, nothing dark-on-dark | ☐ |
| 18 | Switch between Paper and Ink with a diagram on screen and in the editor | The editor follows Appearance; the saved file stays legible in both (its colours are yours and do not change, its text and page do) | ☐ |
