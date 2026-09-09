# Stage 0 — Manual QA script

Run on both machines. Record results in `docs/qa/results/YYYY-MM-DD-stage-0.md` (date, OS, build hash).

| # | Step | Expect | Pass |
|---|---|---|---|
| 1 | `pnpm install && pnpm check` | All green | ☐ |
| 2 | `pnpm tauri dev` | Window "AML" opens, wordmark, "Hello Folio.", version line with correct platform | ☐ |
| 3 | Resize window below 900×600 | Refuses (min size) | ☐ |
| 4 | Dev tools → set `document.documentElement.dataset.mode = "ink"` | Dark palette applies; text legible | ☐ |
| 5 | Panels (WP 0.5): slide, pin, Layout toggle ⌘/Ctrl+Shift+L | State persists across restart | ☐ |
| 6 | Command palette ⌘/Ctrl+K | Opens, fuzzy filters, Esc closes | ☐ |
| 7 | Contrast report (WP 0.4) | Every text token ≥ 4.5:1 | ☐ |
| 8 | Ink palette on screen | Approved by Bryce | ☐ |
| 9 | CI (WP 0.3) | Green on both OSes; artefacts downloadable | ☐ |
