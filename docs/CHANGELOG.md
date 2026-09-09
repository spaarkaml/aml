# Changelog

All notable changes. Format: one entry per work package.

## Unreleased

### WP-0.2 — Repository scaffold (2026-09-09)
- Tauri 2.11 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vite 8, pnpm.
- Rust ↔ TS bridge via tauri-specta; `cargo test` regenerates `src/ipc/bindings.ts`.
- Biome lint/format, Vitest + Testing Library, `scripts/check-vocabulary.mjs`.
- Design tokens for Paper and Ink modes in `src/app/tokens.css` (ADR-010).
- First command `app_info`; "Hello Folio" window.

### WP-0.3 — CI (2026-09-09)
- GitHub Actions matrix (macOS, Windows): fmt, clippy, cargo test, bindings-current check, typecheck, lint, vocabulary, unit tests, frontend build, unsigned bundle upload.
