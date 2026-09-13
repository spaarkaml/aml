//! Sync conflict commands (WP-4.2). The judgement is in `crate::conflicts`.

use tauri::State;

use crate::conflicts::{Conflict, ConflictPair, Resolution};
use crate::folio::{Folio, FolioError, Result};
use crate::state::AppState;

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// Every set-aside copy in the open Folio, newest first.
#[tauri::command]
#[specta::specta]
pub fn conflicts_list(state: State<AppState>) -> Result<Vec<Conflict>> {
    with_folio(&state, |f| Ok(f.conflicts()))
}

/// Both sides of one conflict, as text where they are text.
#[tauri::command]
#[specta::specta]
pub fn conflict_read(state: State<AppState>, path: String) -> Result<ConflictPair> {
    with_folio(&state, |f| f.read_conflict(&path))
}

/// Resolves one conflict. Refused with `conflict` if the original changed since it was read.
#[tauri::command]
#[specta::specta]
pub fn conflict_resolve(
    state: State<AppState>,
    path: String,
    resolution: Resolution,
    // f64 because specta forbids u64 in command arguments; ms timestamps fit in 2^53.
    expected_original_mtime: Option<f64>,
) -> Result<()> {
    with_folio(&state, |f| {
        f.resolve_conflict(&path, resolution, expected_original_mtime.map(|m| m as u64))
    })
}
