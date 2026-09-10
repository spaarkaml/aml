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
| 10 | *(WP-2.3)* Open a well-linked note; ⌘⇧I | Backlinks lists every note you know links here, each with its section; clicking jumps there | ☐ |
| 11 | *(WP-2.3)* Open a note whose name appears as plain text elsewhere; *Link* one, then *Link all* | Text becomes `[[Name]]` (alias kept when the case differs); counts move from unlinked to linked; nothing inside code or existing links is touched | ☐ |
| 12 | *(WP-2.4)* Left panel → Tags; expand a nested tag; select it; click a `#tag` chip in a note | Hierarchy and counts match your notes; the note list opens notes; the chip selects its tag | ☐ |
| 13 | *(WP-2.5)* Left panel → Search (⌘⇧F); type a word you use often, then narrow it with `tag:` and `-`; try `/regex/` and a deliberately broken one | Results and excerpts appear as you type without stutter; fields narrow correctly; the broken regex shows an error and the field stays usable | ☐ |
| 14 | *(WP-2.5)* With a note open, search a word in it and use **Replace in this note** | Every match outside code is replaced, the count is right, and ⌘Z undoes it in one step | ☐ |
