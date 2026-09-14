# Stage 8 — Manual QA script

Only the updater is built (WP-8.2, and the rest of WP-8.1). The rest of Stage 8 —
performance, accessibility, crash reports, onboarding, the docs freeze — has its own lines
when it exists. Record results in `docs/qa/results/YYYY-MM-DD-stage-8.md`.

§2 is **Quality Gate 8's second line** ("update from previous build succeeds"). It needed two
releases to exist; **0.2.0 → 0.3.0 passed on both machines on 2026-09-13**, which also signs
§3 — the Windows update ran with no administrator prompt. Result:
`docs/qa/results/2026-09-13-stage-8.md`.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | Tag a release following `docs/RELEASING.md`, and watch the run | Both platforms build; the release is published (not a draft) and carries the DMG, the `-setup.exe`, the MSI, `AML.app.tar.gz`, three `.sig` files and `latest.json` | ☐ |
| 2 | On the Mac, with the *previous* release installed, click the version in the status bar → **Check now** | The new version, its notes and its date; **Update and restart** downloads it with a moving progress bar and AML reopens on the new version — with the same tabs and the same Folio | ☑ 2026-09-13 |
| 3 | Same on the PC | The NSIS installer runs itself, asks for nothing, and AML reopens updated. **No administrator prompt** — that is what `currentUser` buys | ☑ 2026-09-13 |
| 4 | Leave AML running for a day without touching Updates | The chip appears in the status bar by itself within six hours of a release, and never interrupts what you were doing | ☐ |
| 5 | Click **Not now**, then keep working; reopen Updates the next day | The chip is gone and stays gone for that version. Release something newer: it comes back | ☐ |
| 6 | Turn off "Check for updates automatically", quit and reopen | It stays off, on that machine only — the other one still checks | ☐ |
| 7 | Pull the network out and press **Check now** | One plain sentence about not reaching the server. Nothing hangs, nothing retries in a loop, and a *silent* check in the same state says nothing at all | ☐ |
| 8 | On a fresh machine, install from the release page | macOS: right-click → Open gets past Gatekeeper (no "damaged"). Windows: SmartScreen → More info → Run anyway. Then §2 works from that install | ☐ |
| 9 | After updating, open the same Folio on both machines | Nothing in the Folio changed: notes, `.aml/`, manifests and the index are exactly as they were. An update is not a migration | ☐ |

## One top to the window (2026-09-14)

| # | Step | Expect | Pass |
|---|---|---|---|
| T1 | *(Mac)* Open AML | No grey system title bar: the red, yellow and green buttons sit inside AML's top bar, vertically centred, with the monogram just after them | ☐ |
| T2 | *(Mac)* Drag the top bar by an empty spot, then double-click one | The window moves; double-click zooms it as your Dock setting says. Clicking a tab or a button does its own thing instead | ☐ |
| T3 | *(Mac)* Enter full screen (green button) | The buttons go away and the monogram moves back to the left edge; leaving full screen puts both back | ☐ |
| T4 | *(Windows)* Open AML | No white Windows title bar: minimise, maximise and close are at the right end of AML's top bar, full height; close turns red under the pointer | ☐ |
| T5 | *(Windows)* Drag an edge and a corner; drag the top bar; double-click it; press Win+Z | It resizes from every edge and has a shadow; it moves; double-click maximises and the middle button becomes Restore; Win+Z shows Snap Layouts | ☐ |
| T6 | *(Windows)* Open Settings (a sheet), then click close | The window closes — the sheet does not swallow the click | ☐ |

