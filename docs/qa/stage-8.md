# Stage 8 — Manual QA script

Only the updater is built (WP-8.2, and the rest of WP-8.1). The rest of Stage 8 —
performance, accessibility, crash reports, onboarding, the docs freeze — has its own lines
when it exists. Record results in `docs/qa/results/YYYY-MM-DD-stage-8.md`.

§2 is **Quality Gate 8's second line** ("update from previous build succeeds") and needs two
releases to exist, so it cannot be run until the release after this one.

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | Tag a release following `docs/RELEASING.md`, and watch the run | Both platforms build; the release is published (not a draft) and carries the DMG, the `-setup.exe`, the MSI, `AML.app.tar.gz`, three `.sig` files and `latest.json` | ☐ |
| 2 | On the Mac, with the *previous* release installed, click the version in the status bar → **Check now** | The new version, its notes and its date; **Update and restart** downloads it with a moving progress bar and AML reopens on the new version — with the same tabs and the same Folio | ☐ |
| 3 | Same on the PC | The NSIS installer runs itself, asks for nothing, and AML reopens updated. **No administrator prompt** — that is what `currentUser` buys | ☐ |
| 4 | Leave AML running for a day without touching Updates | The chip appears in the status bar by itself within six hours of a release, and never interrupts what you were doing | ☐ |
| 5 | Click **Not now**, then keep working; reopen Updates the next day | The chip is gone and stays gone for that version. Release something newer: it comes back | ☐ |
| 6 | Turn off "Check for updates automatically", quit and reopen | It stays off, on that machine only — the other one still checks | ☐ |
| 7 | Pull the network out and press **Check now** | One plain sentence about not reaching the server. Nothing hangs, nothing retries in a loop, and a *silent* check in the same state says nothing at all | ☐ |
| 8 | On a fresh machine, install from the release page | macOS: right-click → Open gets past Gatekeeper (no "damaged"). Windows: SmartScreen → More info → Run anyway. Then §2 works from that install | ☐ |
| 9 | After updating, open the same Folio on both machines | Nothing in the Folio changed: notes, `.aml/`, manifests and the index are exactly as they were. An update is not a migration | ☐ |
