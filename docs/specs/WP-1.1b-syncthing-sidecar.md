# WP-1.1b — Synced Folio: Syncthing sidecar
**Stage:** 1 · **Depends on:** 1.1 · **ADRs:** 001, 004, 005 · **Sessions:** 1.5

## Goal
Keep a Folio identical on the Mac, the PC and the NAS without installing anything separately: AML bundles Syncthing, runs it in the background, and offers a one-time pairing screen.

## Design
- **Binary:** `scripts/fetch-syncthing.mjs` downloads the pinned release (`v2.1.5`, sha256-checked against the release manifest) into `src-tauri/binaries/syncthing-<target-triple>`; Tauri's `bundle.externalBin` ships it next to the AML executable. Binaries are not committed; CI and developers run `pnpm sidecar:fetch` (`AML_SYNCTHING_BIN` overrides the path for tests).
- **Lifecycle (`sidecar/syncthing.rs`):** started on a background thread at launch when the user turned sync on (`sync-settings.json` in app-data), stopped on exit (`RunEvent::Exit` → REST shutdown, then kill). Home directory `<app-data>/syncthing` (ADR-004: per device). REST on `127.0.0.1:41384` with a generated API key persisted in `aml-apikey`; the stock 8384 is left alone for a user's own Syncthing.
- **Defaults applied on every start:** relays, global discovery, NAT traversal, auto-upgrade, crash and usage reporting off; local discovery on; Syncthing's "Default Folder" removed. Nothing leaves the LAN.
- **Pairing (`SyncScreen.tsx`):** step 1 turn on + show this computer's Device ID (copy); step 2 paste the NAS Device ID (+ optional LAN address → `tcp://ip:22000`); step 3 folders: offers from the NAS appear as pending → "Accept → choose folder…" (native picker) → "Open as Folio" (creates `.aml/` if the folder is new); or share the open Folio with the NAS (folder ID is a slug of the Folio name; the NAS then accepts in its own UI). Accepting/sharing writes `.stignore` (OS junk and temp files only; `.aml/` syncs).
- **Folder settings:** send-receive, FS watcher on, ignore permissions (NAS/Windows safe), trash-can versioning 30 days on this side (the NAS keeps Staggered Versioning as the real history).
- **Status:** `sync_status` polled every 5 s while a Folio or the screen is open; status bar shows `NAS · up to date` / `Syncing 42%` / `Scanning…` / `NAS offline` / `Not synced`; clicking opens the screen. "Show sync log" tails `syncthing.log`.
- **Commands:** `sync_status`, `sync_enable`, `sync_disable`, `sync_add_device`, `sync_remove_device`, `sync_accept_folder`, `sync_share_folder`, `sync_is_synced_path`, `sync_log_tail`.
- **Dependencies:** `ureq 3` (small blocking HTTP client for the loopback REST API; no tokio surface in commands) and `rand 0.10` (API key). Syncthing itself is MPL-2.0, redistributed unmodified.

## Acceptance criteria
- [x] API key created once and reused; settings persist (Rust test).
- [x] Live: sidecar starts, answers, defaults applied, device + folder configured, `.stignore` written, stops (Rust test, `--ignored`, run 2026-09-10 on the Mac).
- [x] Pairing flow in the UI: turn on → add NAS (bad ID rejected) → accept offered folder → open as Folio → status bar "NAS · up to date" (e2e, mocked sidecar).
- [x] Share an open Folio from the palette; status bar shows progress (e2e).
- [x] Paired with the DRIVESTOR from the Mac; files appear on the NAS (Bryce, 2026-09-10). PC pairing and the restart check remain in `qa/stage-1.md` §20–21.

## Lessons recorded
- The sidecar must never block `setup`: on a cold start Syncthing takes 1–3 s to answer, so autostart runs on a thread.
- Syncthing's `serve --gui-address/--gui-apikey` flags override config, so the port and key never need editing in `config.xml`.
