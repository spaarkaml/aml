//! Folio settings commands (WP-3.2).

use tauri::State;

use crate::config::{
    appearance_of, preferences_of, with_appearance, with_preferences, Appearance, Preferences,
};
use crate::folio::{Folio, FolioError, Result};
use crate::state::AppState;
use crate::templates::daily_folder;

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

/// The Folio's preferences, or all-absent when it has none of its own.
#[tauri::command]
#[specta::specta]
pub fn preferences_read(state: State<AppState>) -> Result<Preferences> {
    with_folio(&state, |folio| Ok(preferences_of(&folio.settings()?)))
}

/// Saves preferences to `.aml/config.yaml`, leaving every other setting in the file alone.
/// A Daily folder is tidied before it is written, and refused outright if it would put notes
/// anywhere but inside the Folio.
#[tauri::command]
#[specta::specta]
pub fn preferences_write(state: State<AppState>, preferences: Preferences) -> Result<Preferences> {
    let asked = preferences
        .daily_folder
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let cleaned = daily_folder(preferences.daily_folder.as_deref());
    if !asked.is_empty() && cleaned.is_none() {
        return Err(FolioError::InvalidPath(asked));
    }
    let tidied = Preferences {
        daily_folder: cleaned,
    };
    with_folio(&state, |folio| {
        let settings = with_preferences(folio.settings()?, &tidied);
        folio.write_settings(&settings)?;
        Ok(tidied.clone())
    })
}
