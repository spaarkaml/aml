//! Tauri commands exposed to the UI. Every command is registered in `lib.rs`
//! via `collect_commands!` and exported to `src/ipc/bindings.ts` by tauri-specta.
//! Hand-written IPC on the TypeScript side is forbidden (ADR-002).

pub mod app;
pub mod folio;
pub mod spell;
pub mod sync;
