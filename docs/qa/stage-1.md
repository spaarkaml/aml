# Stage 1 — Manual QA script

Run on both machines against a Folio paired with the DRIVESTOR (or a Local Folio until Synced ships in WP-1.1b). Record results in `docs/qa/results/YYYY-MM-DD-stage-1.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | Create a Folio in an empty folder | `.aml/config.yaml`, `.aml/snapshots/`, `.stignore` appear; Browser shows empty | ☐ |
| 2 | Open a non-Folio folder | Error with "Make it a Folio" button; clicking creates it | ☐ |
| 3 | In Finder/Explorer add `hello.md`, a folder, and a `.png` | Browser updates within 1 s; png shown dimmed as a file | ☐ |
| 4 | Click a note; type; wait 1 s | Status: ● Unsaved → Saved; file on disk is canonical markdown | ☐ |
| 5 | Open the saved file in a text editor, add a line, save | If AML note is clean: reloads silently. If dirty: banner with Reload / Keep mine | ☐ |
| 6 | Paste the contents of `test-corpus/raw/mixed-everything.md` into a new note; save; diff | Front matter, callout, HTML survive verbatim; rest canonical | ☐ |
| 7 | Open `test-corpus/edge/large.md` copy; type 200 words at speed | No lag or dropped characters (60 fps feel); word count updates | ☐ |
| 8 | Backspace at start of first heading; ⌘A then type | Front matter chip remains | ☐ |
| 9 | Kill the app mid-typing (Force Quit) 5× | No `.aml-tmp-*` files; note content is the last completed save | ☐ |
| 10 | Word count: note with front matter, code block, HTML comment | Those excluded; headings/lists included | ☐ |
| 11 | *(WP-1.3)* Paste a screenshot; drop a PNG | File under `<folder>/assets/`, image renders, markdown holds the relative path | ☐ |
| 12 | *(WP-1.5)* Open three notes; ⌘W; ⌘[ ; ⌘] ; ⌘2 | Tab closes (window stays open on macOS); history walks; tab 2 activates | ☐ |
| 13 | *(WP-1.5)* Right-click a note → Move to Trash… | Native confirm; note goes to the OS Trash / Recycle Bin; tab closes | ☐ |
| 14 | *(WP-1.5)* Drag a note onto a folder; F2 on the open note | Note moves on disk and its tab follows; inline rename box appears in the Browser | ☐ |
| 15 | *(WP-1.5)* Type in a note, pause 2 s, keep typing | Caret never jumps after "Saved" appears | ☐ |
| 16 | *(WP-1.6)* ⌘O, type part of a heading, Enter | Note opens with the caret in that heading; results feel instant | ☐ |
| 17 | *(WP-1.7+)* spell check | — | ☐ |
