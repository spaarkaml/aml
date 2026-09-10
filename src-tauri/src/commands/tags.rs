//! Tag commands (WP-2.4).

use tauri::State;

use crate::folio::{FolioError, Result};
use crate::index::tags::TagEntry;
use crate::state::AppState;

/// Every distinct (tag, note) pair in the Folio.
#[tauri::command]
#[specta::specta]
pub fn tags_list(state: State<AppState>) -> Result<Vec<TagEntry>> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    index.tags_list()
}

/// Paths of the notes carrying `tag` or a tag nested under it.
#[tauri::command]
#[specta::specta]
pub fn tag_notes(state: State<AppState>, tag: String) -> Result<Vec<String>> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    index.tag_notes(&tag)
}
