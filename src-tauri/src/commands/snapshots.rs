//! Snapshot commands (WP-4.1). The rules are in `crate::snapshots`.

use tauri::State;

use crate::folio::{Folio, FolioError, NoteMeta, Result};
use crate::snapshots::{Snapshot, SnapshotUsage};
use crate::state::AppState;

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// A note's Snapshots, newest first.
#[tauri::command]
#[specta::specta]
pub fn snapshots_list(state: State<AppState>, path: String) -> Result<Vec<Snapshot>> {
    with_folio(&state, |f| f.snapshots(&path))
}

/// One Snapshot's text.
#[tauri::command]
#[specta::specta]
pub fn snapshot_read(state: State<AppState>, path: String, id: String) -> Result<String> {
    with_folio(&state, |f| f.read_snapshot(&path, &id))
}

/// Keeps the note as it is on disk now, with an optional label.
#[tauri::command]
#[specta::specta]
pub fn snapshot_take(
    state: State<AppState>,
    path: String,
    label: Option<String>,
) -> Result<Snapshot> {
    with_folio(&state, |f| f.take_snapshot(&path, label.as_deref()))
}

/// Puts a Snapshot back as the note, keeping the text it replaces as a Snapshot first.
#[tauri::command]
#[specta::specta]
pub fn snapshot_restore(state: State<AppState>, path: String, id: String) -> Result<NoteMeta> {
    with_folio(&state, |f| f.restore_snapshot(&path, &id))
}

/// How many Snapshots the Folio holds and how much room they take.
#[tauri::command]
#[specta::specta]
pub fn snapshots_usage(state: State<AppState>) -> Result<SnapshotUsage> {
    with_folio(&state, |f| Ok(f.snapshot_usage()))
}
