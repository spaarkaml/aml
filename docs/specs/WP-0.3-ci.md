# WP-0.3 — Continuous integration
**Stage:** 0 · **Depends on:** 0.2 · **ADRs:** 002, 012 · **Sessions:** 0.5

## Goal
Every push and PR runs the full check on macOS and Windows and produces unsigned installers as downloadable artefacts.

## Acceptance criteria
- [x] `.github/workflows/ci.yml` matrix macos-latest + windows-latest.
- [x] Steps: fmt, clippy `-D warnings`, cargo test, bindings-current diff, typecheck, lint, vocabulary, unit tests, frontend build, `tauri build`, upload `.dmg`/`.msi`.
- [ ] First green run on GitHub *(needs the repo pushed to GitHub — your action)*.

## Notes
- No signing (ADR-012). `TAURI_SIGNING_PRIVATE_KEY` left empty; the updater key is added in WP-8.2.
- Rust cache via Swatinem/rust-cache keeps Windows runs under ~10 min after the first.
