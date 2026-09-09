# WP-0.6 — Test infrastructure
**Stage:** 0 · **Depends on:** 0.2 · **ADRs:** 002, 003 · **Sessions:** 1

## Goal
The guardrails AI sessions rely on: a round-trip corpus that grows every stage, browser e2e for the shell, and one `pnpm check` that runs everything.

## Decisions
- **E2E runs in Chromium against Vite with mocked IPC**, not inside the Tauri window: tauri-driver does not support macOS WebKit. In-app smoke tests on Windows CI are a Stage 8 item.
- Corpus expectations: `lossless` (byte-identical), `canonicalised` (differs but idempotent + AST-equal), `raw` (contains Raw-node content emitted verbatim). The assertions land in WP-1.2 with the bridge; `src/lib/corpus.test.ts` guards the manifest until then.

## Acceptance criteria
- [x] 48 corpus files, 6 categories, manifest with notes.
- [x] `pnpm e2e` green locally; wired into CI.
- [x] `pnpm check` = typecheck, lint, unit, vocabulary, contrast, clippy, cargo test.
