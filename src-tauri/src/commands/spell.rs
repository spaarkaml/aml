use tauri::State;

use crate::folio::{FolioError, Result};
use crate::state::AppState;

fn with_speller<T>(
    state: &State<AppState>,
    f: impl FnOnce(&mut crate::spell::Speller) -> Result<T>,
) -> Result<T> {
    let mut guard = state
        .speller
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(&mut guard)
}

/// Returns the words from `words` that the en_AU dictionary (plus the personal and ignore
/// lists) does not accept. Tokenising is the editor's job; this only judges words.
#[tauri::command]
#[specta::specta]
pub fn spell_check(state: State<AppState>, words: Vec<String>) -> Result<Vec<String>> {
    with_speller(&state, |s| s.misspelled(&words))
}

#[tauri::command]
#[specta::specta]
pub fn spell_suggest(state: State<AppState>, word: String) -> Result<Vec<String>> {
    with_speller(&state, |s| s.suggest(&word, 8))
}

/// Adds the word to `.aml/dictionary.txt` in the open Folio.
#[tauri::command]
#[specta::specta]
pub fn spell_add(state: State<AppState>, word: String) -> Result<()> {
    with_speller(&state, |s| s.add(&word))
}

/// Ignores the word until the Folio is closed.
#[tauri::command]
#[specta::specta]
pub fn spell_ignore(state: State<AppState>, word: String) -> Result<()> {
    with_speller(&state, |s| {
        s.ignore(&word);
        Ok(())
    })
}
