# AML — instructions for AI coding sessions

AML is a self-hosted desktop writing environment (macOS + Windows) built on plain markdown files kept in sync with a home NAS by a Syncthing sidecar bundled in the app (Local-only and SMB Network modes also exist). It combines a linked-note knowledge base, a polished WYSIWYG editor that reads and writes canonical markdown, and professional compile/typesetting.

## Read first, every session
1. `docs/04-AI-DEVELOPMENT-PLAYBOOK.md` — how work is done here (specs, DoD, session protocol)
2. `docs/02-ARCHITECTURE-DECISIONS.md` — accepted ADRs are binding
3. `docs/03-GLOSSARY-AND-NAMING.md` — use these words and no others
4. `docs/ARCHITECTURE.md` — current module map (created in Stage 0)
5. The spec for the work package you are doing: `docs/specs/WP-x.y-*.md`

## Hard rules
- Never write to user `.md` files except through the atomic-write command. Saves emit canonical AML markdown; syntax the parser does not model is preserved verbatim as a Raw node — never dropped.
- Nothing derived or per-device (SQLite index, window state, layouts) lives inside the Folio; everything under `.aml/` is synced and must be merge-friendly (one item per line).
- The Syncthing sidecar is managed only through the `sidecar::syncthing` module; never shell out to it elsewhere.
- No file-system access from the webview; all I/O is Rust commands exposed via generated bindings.
- Do not add dependencies without a justification line in the spec.
- Vocabulary is fixed (ADR-011): root folder = **Folio**, virtual group = **Bounding**, folder-with-manifest = **Project**. Never "vault", "collection", "study", "library", "workspace" for these.
- Every WP ends with `pnpm check` green and the docs listed in the spec updated.
- Ask before changing an ADR; propose a superseding ADR instead of editing code around it.

## Status
Run `pnpm sidecar:fetch` once after cloning (downloads the Syncthing binary; not committed).
Stage 0 and Stage 1 done (WP-1.1–1.7 + 1.1b; NAS pairing confirmed 2026-09-10). Stage 2 in progress: WP-2.1–2.8 (index, links, backlinks, tags, search, outline, templates + Daily, Boundings + Overview) done 2026-09-11; next 2.9 command palette pass (WP-2.10 Obsidian migration is skipped by decision). Gate 1 manual QA (`docs/qa/stage-1.md`) and the Windows install are Bryce's pending tasks. NAS setup steps are in `docs/06-NAS-SETUP.md`. `docs/CHANGELOG.md` is the per-WP log.
