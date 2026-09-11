# Stage 5 — Manual QA script

Run against your real Folio on the Mac (and later the PC). Record results in
`docs/qa/results/YYYY-MM-DD-stage-5.md`.

Quality Gate 5 needs WP-5.4 (Outliner), 5.5 (Stitch), 5.6 (Research) and 5.7 (Layouts) as
well; its fourth line also needs the **Conflicts panel (WP-4.2)**, which does not exist yet,
and Stitch's line needs the **snapshot engine (WP-4.1)**, which does not either. The lines
below are what WP-5.1, 5.2, 5.3 and 5.8 can be signed on.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | *(WP-5.1)* Take a real manuscript folder — parts as folders, scenes as notes — and make it a Project from the Browser's context menu | Everything already in the folder is in the Binder straight away, nested as the folders are, in the Browser's order; nothing moved on disk; `project.aml.yaml` is readable and one item per line | ☐ |
| 2 | *(WP-5.1)* Add a note to the Project folder from Finder, and delete another from Finder, with AML open | The new one appears in the Binder within a second or two; the deleted one goes; the manifest still names the deleted one (open the file and check) — it is kept in case it is only late to sync | ☐ |
| 3 | *(WP-5.2)* Reorder six scenes by dragging inside a part, then quit AML and reopen it | The order is the one you set; it came from the manifest, so the PC will see it too | ☐ |
| 4 | *(WP-5.2)* Drag a scene from one part into another, and drop another onto a part's middle | **The file moves** — check in Finder. If anything linked to it, the rename dialog offered to rewrite the links | ☐ |
| 5 | *(WP-5.2)* Put the caret at the top of a section in a long chapter and press ⌘⇧K | The rest of the chapter is a new document beside it, named after its heading, in the Binder straight after it, and open. The chapter you split ends cleanly — no empty heading left behind | ☐ |
| 6 | *(WP-5.3)* On the Corkboard, write a synopsis on four cards and give three of them a status | The text is in each note's own front matter (check the YAML view, or the file); nothing else in the file changed | ☐ |
| 7 | *(WP-5.3)* Colour by status, then by label | The key names every value; the same word is the same colour after a restart and on the PC | ☐ |
| 8 | *(WP-5.3)* Reorder two cards on the board, then look at the Binder | **Gate 5's first line.** The Binder and the Corkboard agree, and so does the manifest | ☐ |
| 9 | *(WP-5.2)* Untick three scenes, then untick a whole part | They dim and strike through; the part takes its scenes with it; `exclude:` in the manifest holds only the part, not its children | ☐ |
| 10 | *(WP-5.8)* Give the Project a target and a deadline a month out | The ring counts the words a compile would take, not every word in the folder; the pace is words a day and falls as you write; both live in `project.aml.yaml`, so the PC has them | ☐ |
| 11 | *(WP-5.8)* Compare the dashboard's totals with a compile-order word count you trust | Documents, parts and words agree; "in the compile" is lower by exactly what you unticked in §9 | ☐ |
| 12 | *(WP-5.1)* Open the same Project on the PC, reorder there, and come back | **Gate 5's fourth line, in part.** Both sides agree. If Syncthing wrote a `*.sync-conflict-*` manifest, note it here — the line-wise merge that is meant to handle it is WP-4.2 and is not built | ☐ |
