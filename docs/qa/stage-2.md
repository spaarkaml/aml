# Stage 2 — Manual QA script

Run against your real Folio on the Mac (and later the PC). Record results in `docs/qa/results/YYYY-MM-DD-stage-2.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | *(WP-2.1)* Open your Folio; watch the status bar | `Indexing n / total` appears briefly on first open, then disappears; log line `index refreshed: … notes scanned` | ☐ |
| 2 | *(WP-2.1)* Quit; delete `~/Library/Application Support/com.brycereeves.aml/index/` (Windows: `%APPDATA%\com.brycereeves.aml\index\`); relaunch and open the Folio | Rebuilds within 5 s for 5k notes; Quick Open works during and after | ☐ |
| 3 | *(WP-2.1)* ⌘K → Rebuild Index while typing in a note | Typing never stutters; progress shows; "Saved" still appears | ☐ |
| 4 | *(WP-2.1)* In Finder add a note with a new `# Heading`, then ⌘O and type the heading | Found within 1 s without a rebuild | ☐ |
| 5 | *(WP-2.1)* Rename a folder in Finder; ⌘O | Old paths gone, new paths present | ☐ |
| 6 | *(WP-2.2)* In a note type `[[`, part of a title, Enter; then `[[Note#`, pick a heading; click each link | Picker follows typing; links open the note / jump to the heading | ☐ |
| 7 | *(WP-2.2)* Type `[[Not Yet Written]]`, click it | Dashed until clicked; note created beside the current one and opened | ☐ |
| 8 | *(WP-2.2)* Rename a heavily linked note (F2), accept the preview; open three linking notes; then ⌘K → Undo Last Rename | Every `[[link]]` and `(x.md)` reference updated, headings/aliases kept; undo restores name and links | ☐ |
| 9 | *(WP-2.2)* Drag a note into another folder | Preview lists its own relative `.md` links (if any) and links into it; nothing breaks after the move | ☐ |
