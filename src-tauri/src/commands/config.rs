//! Folio settings commands (WP-3.2).

use tauri::State;

use crate::config::{appearance_of, with_appearance, Appearance};
use crate::folio::{Folio, FolioError, Result};
use crate::state::AppState;

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// The Folio's appearance settings, or all-absent when it has none of its own.
#[tauri::command]
#[specta::specta]
pub fn appearance_read(state: State<AppState>) -> Result<Appearance> {
    with_folio(&state, |folio| Ok(appearance_of(&folio.settings()?)))
}

/// Saves appearance to `.aml/config.yaml`, leaving every other setting in the file alone.
#[tauri::command]
#[specta::specta]
pub fn appearance_write(state: State<AppState>, appearance: Appearance) -> Result<()> {
    with_folio(&state, |folio| {
        let settings = with_appearance(folio.settings()?, &appearance);
        folio.write_settings(&settings)
    })
}
