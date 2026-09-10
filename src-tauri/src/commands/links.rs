//! Link commands (WP-2.2): resolution for the editor, and rename propagation with preview.

use tauri::State;

use crate::folio::{FolioError, Result};
use crate::index::links::{apply_edits, LinkQuery, NoteEdits, RenamePreview};
use crate::state::AppState;

/// Resolves each link as seen from `from`; `null` where nothing matches.
#[tauri::command]
#[specta::specta]
pub fn link_resolve(
    state: State<AppState>,
    from: String,
    links: Vec<LinkQuery>,
) -> Result<Vec<Option<String>>> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    links
        .iter()
        .map(|l| index.resolve(&from, &l.target, &l.kind))
        .collect()
}

/// What renaming `from` → `to` would rewrite. Call before `entry_rename`.
#[tauri::command]
#[specta::specta]
pub fn link_rename_preview(
    state: State<AppState>,
    from: String,
    to: String,
) -> Result<RenamePreview> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    index.rename_preview(&from, &to)
}

/// Applies a preview's edits after the rename happened. Returns lines rewritten.
#[tauri::command]
#[specta::specta]
pub fn link_rename_apply(state: State<AppState>, notes: Vec<NoteEdits>) -> Result<u32> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let folio = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    apply_edits(folio.root(), &notes)
}
