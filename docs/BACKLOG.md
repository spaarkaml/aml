# AML — Backlog (parked, not planned for v1)

Items here were removed from the plan by a decision, or are ideas captured for later. Each has the stage it would slot into if revived.

| Item | Why parked | Would slot into |
|---|---|---|
| Review collaboration: comments, DOCX tracked-changes round-trip | Q2 = single author | Stage 7 |
| Real-time co-editing (CRDT + relay on the NAS in Docker) | Q2 = single author; doubles architecture | Post-v1 |
| Scrivener `.scriv` importer | Q5 = nothing to import | Stage 7 |
| Content-addressed history store with "Folio as at <date>" browsing | Q1 = 30-minute snapshots are enough | Stage 4 |
| Embedded git | Q1; risky over shared storage | Never, unless re-decided |
| Network (SMB direct) location + Offline Copy/Return | Synced chosen as default | Stage 4 WP 4.6, only if needed |
| Code signing / notarisation | Q25 = personal tool | If ever shared |
| MOBI export | Amazon no longer accepts MOBI | — |
| Linux build | Q16 unanswered; Tauri makes it cheap | Stage 8 |
| iOS/Android companion | Q17; out of scope for a desktop app | — |
| PDF annotation in Research panel | Q20 | Stage 7 |
| Template scripting (JS sandbox) | Only if wanted | Stage 7 |
- **CI: Windows `cargo test` disabled** (2026-09-10). The tauri-linked test executable exits with `STATUS_ENTRYPOINT_NOT_FOUND` on the hosted `windows-latest` runner, so CI only compiles the Rust tests there. Run `cargo test` in `src-tauri` on the Windows PC to confirm, then investigate (likely a stray `WebView2Loader.dll`/DLL version on the runner PATH) and re-enable.
