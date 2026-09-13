# Stage 4 — Manual QA script

WP-4.2 (Conflicts, §1–§9) and WP-4.3 (sync health, §10–§14) are built. WP-4.1 (Snapshots),
4.4 (NAS checklist) and 4.5 (cross-OS names) are not. Record results in
`docs/qa/results/YYYY-MM-DD-stage-4.md`.

§1–§4 need **both machines** and are **Quality Gate 4's first line**.

## Conflicts (WP-4.2)

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | Pick a note. On the PC, turn Wi-Fi off. Edit the note's second paragraph on the PC, and a *different* paragraph of the same note on the Mac. Turn the PC's Wi-Fi back on | Within about 10 seconds of both having synced, the Mac's status bar shows **1 conflict**, and the note shows a banner saying another computer's version was set aside | ☐ |
| 2 | Look in the Browser and in Quick Open (⌘P) for the note | It is there **once**. No `sync-conflict` file anywhere in the Browser, Quick Open, search or the graph | ☐ |
| 3 | Click the chip, open the note in the list | Both versions side by side; each of the two edited paragraphs is its own difference, with the changed words marked. It says the older edit was *written on another computer* | ☐ |
| 4 | Take the Mac's paragraph from **In place** and the PC's from **Set aside**, then **Save my choices** | The note holds both edits and nothing else changed. The chip is gone on both machines once they sync. The Trash holds the note's previous version and the set-aside copy | ☐ |
| 5 | Make another conflict the same way; this time **Keep both as separate notes** | A second note, `… (copy from <date>).md`, beside the original; nothing in the Trash | ☐ |
| 6 | Make a conflict; open it; then, *before choosing*, edit the note again on either machine and let it sync; now press **Save my choices** | It refuses, says the note changed again while you were deciding, and shows the new text. Nothing was written | ☐ |
| 7 | Rename a Bounding on the PC while offline, and add a note to the same Bounding on the Mac; reconnect | A conflict called **Boundings**. Every difference starts on **Both**; saving gives one Boundings file with the rename *and* the added note | ☐ |
| 8 | In one note, type on the Mac and — before the 1-second autosave — change the same note on disk from elsewhere (a text editor) | The *changed on disk* banner offers **Compare**; it shows *On disk* against *Your edits*, and saving your choices writes them and reloads the note | ☐ |
| 9 | Resolve everything, then open **Resolve Conflicts…** from the palette | *No conflicts*, with a sentence saying what would put something here | ☐ |

## Sync health (WP-4.3)

| # | Step | Expect | Pass |
|---|---|---|---|
| 10 | Unplug the NAS's network cable | Within about a minute the status bar goes *Finding the NAS…* then *NAS offline*; a few minutes later *NAS offline · seen 3 min ago*. **No banner** | ☐ |
| 11 | Plug it back in | Back to *NAS · up to date* on its own, without restarting anything. **Gate 4's third line** is §10 and §11 | ☐ |
| 12 | Open **NAS sync** while it is offline | The NAS row says *not connected · last seen …* | ☐ |
| 13 | Pause the folder in Syncthing's own view (**Open Syncthing's own view** at the bottom of NAS sync) | The status bar says *Sync paused*, not offline and not an error. Resume it: back to up to date | ☐ |
| 14 | *(If it happens again)* A folder Syncthing cannot finish — the stuck-at-95 % case | The status bar says *Sync stuck · N files*, a banner names the files and why, and NAS sync lists them under the folder | ☐ |
