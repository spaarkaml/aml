# Stage 2 — Manual QA script

Run against your real Folio on the Mac (and later the PC). Record results in `docs/qa/results/YYYY-MM-DD-stage-2.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | *(WP-2.1)* Open your Folio; watch the status bar | `Indexing n / total` appears briefly on first open, then disappears; log line `index refreshed: … notes scanned` | ☐ |
| 2 | *(WP-2.1)* Quit; delete `~/Library/Application Support/com.brycereeves.aml/index/` (Windows: `%APPDATA%\com.brycereeves.aml\index\`); relaunch and open the Folio | Rebuilds within 5 s for 5k notes; Quick Open works during and after | ☐ |
| 3 | *(WP-2.1)* ⌘K → Rebuild Index while typing in a note | Typing never stutters; progress shows; "Saved" still appears | ☐ |
| 4 | *(WP-2.1)* In Finder add a note with a new `# Heading`, then ⌘O and type the heading | Found within 1 s without a rebuild | ☐ |
| 5 | *(WP-2.1)* Rename a folder in Finder; ⌘O | Old paths gone, new paths present | ☐ |
