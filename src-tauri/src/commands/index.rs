//! Index commands (ADR-007). The index is opened with the Folio, brought up to date on a
//! background thread, kept current by the watcher (`apply_changes`) and rebuilt on demand.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::folio::{Folio, FolioError, Result};
use crate::index::{db_path_for, Index, IndexStatus, NoteIndexEntry, SearchHit};
use crate::state::AppState;

/// Emitted while a build or refresh runs; `done == total` marks the end.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub done: u32,
    pub total: u32,
}

fn with_index<T>(state: &State<AppState>, f: impl FnOnce(&Index) -> Result<T>) -> Result<T> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    f(index)
}

/// Opens the Folio's database and refreshes it on a thread (the UI must never wait).
pub fn open_for(app: &AppHandle, state: &State<AppState>, folio: &Folio) -> Result<()> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = Index::open(&db_path_for(&app_data, folio.root()), folio)?;
    let worker = index.for_thread()?;
    *state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))? = Some(index);
    let handle = app.clone();
    std::thread::spawn(move || run_build(&handle, &worker, false));
    Ok(())
}

fn run_build(app: &AppHandle, worker: &Index, full: bool) {
    let mut report = |done: u32, total: u32| {
        if let Err(e) = (IndexProgress { done, total }).emit(app) {
            log::warn!("failed to emit IndexProgress: {e}");
        }
    };
    let result = if full {
        worker.rebuild(&mut report)
    } else {
        worker.refresh(&mut report)
    };
    match result {
        Ok(s) => log::info!(
            "index {}: {} notes scanned, {} indexed, {} removed in {} ms",
            if full { "rebuilt" } else { "refreshed" },
            s.scanned,
            s.indexed,
            s.removed,
            s.duration_ms
        ),
        Err(e) => log::error!("index build failed: {e}"),
    }
}

/// Called by the watcher on its own thread with the debounced Folio-relative paths.
pub fn apply_changes(app: &AppHandle, paths: &[String]) {
    let state = app.state::<AppState>();
    let Ok(guard) = state.index.lock() else {
        return;
    };
    if let Some(index) = guard.as_ref() {
        if let Err(e) = index.update_paths(paths) {
            log::warn!("index update failed: {e}");
        }
    }
}

/// Quick Open's entries: every note's title, aliases and headings, straight from SQLite.
#[tauri::command]
#[specta::specta]
pub fn folio_index(state: State<AppState>) -> Result<Vec<NoteIndexEntry>> {
    with_index(&state, Index::quick_entries)
}

#[tauri::command]
#[specta::specta]
pub fn index_status(state: State<AppState>) -> Result<IndexStatus> {
    with_index(&state, |i| Ok(i.status()))
}

/// Drops the database contents and indexes every note again, on a thread.
#[tauri::command]
#[specta::specta]
pub fn index_rebuild(app: AppHandle, state: State<AppState>) -> Result<()> {
    let worker = with_index(&state, |i| {
        if i.is_building() {
            return Err(FolioError::Io("the index is already being built".into()));
        }
        i.for_thread()
    })?;
    std::thread::spawn(move || run_build(&app, &worker, true));
    Ok(())
}

/// Plain full-text search (words, `"phrases"`); the query language lands in WP-2.5.
#[tauri::command]
#[specta::specta]
pub fn index_search(
    state: State<AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>> {
    with_index(&state, |i| i.search(&query, limit.unwrap_or(40)))
}
