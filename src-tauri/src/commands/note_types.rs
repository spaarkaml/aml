//! Note Type commands (WP-3.3).

use tauri::State;

use crate::folio::{Folio, FolioError, Result};
use crate::note_types::NoteType;
use crate::state::AppState;

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// Every type the Folio knows about — saved, templated or simply in use — with its colour,
/// its icon, the fields its template declares and how many notes carry it.
#[tauri::command]
#[specta::specta]
pub fn types_list(state: State<AppState>) -> Result<Vec<NoteType>> {
    // The counts come from the index; a Folio whose index is still building simply reports
    // zeroes rather than failing, because the list itself is still correct.
    let counts = state
        .index
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|i| i.type_counts().ok()))
        .unwrap_or_default();
    with_folio(&state, |folio| folio.note_types(&counts))
}

/// Every note that declares a type, as `path → type id`. One query answers the Browser, the
/// Properties panel and anywhere else a note is named, so none of them has to ask per note.
#[tauri::command]
#[specta::specta]
pub fn types_by_note(state: State<AppState>) -> Result<std::collections::HashMap<String, String>> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    guard
        .as_ref()
        .ok_or(FolioError::NoFolioOpen)?
        .types_by_note()
}

/// Saves a type's name, colour and icon. Anything equal to AML's own is forgotten rather
/// than written, so `.aml/types.yaml` stays a list of your decisions.
#[tauri::command]
#[specta::specta]
pub fn type_write(state: State<AppState>, r#type: NoteType) -> Result<Vec<NoteType>> {
    with_folio(&state, |folio| folio.write_note_type(&r#type))?;
    types_list(state)
}
