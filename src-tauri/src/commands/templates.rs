//! Template and Daily-note commands (WP-2.7).

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::folio::{Folio, FolioError, NoteMeta, Result};
use crate::state::AppState;
use crate::templates::{
    daily_path, render, RenderVars, TemplateInfo, DAILY_TEMPLATE, DEFAULT_DAILY,
};

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// The templates in `_templates/`.
#[tauri::command]
#[specta::specta]
pub fn templates_list(state: State<AppState>) -> Result<Vec<TemplateInfo>> {
    with_folio(&state, |folio| folio.templates())
}

/// Creates `path` from the named template, expanding its placeholders. Fails if it exists.
#[tauri::command]
#[specta::specta]
pub fn note_from_template(
    state: State<AppState>,
    path: String,
    template: String,
    vars: RenderVars,
) -> Result<NoteMeta> {
    with_folio(&state, |folio| {
        if folio.resolve(&path)?.exists() {
            return Err(FolioError::AlreadyExists(path.clone()));
        }
        let text = folio.template_text(&template).unwrap_or_default();
        folio.write_note(&path, &render(&text, &vars), None)
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DailyNote {
    pub path: String,
    /// False when the note was already there and was simply opened.
    pub created: bool,
}

/// Opens the Daily note for `date` (`YYYY-MM-DD`), creating it from `_templates/daily.md` —
/// or a built-in default when the Folio has no such template — the first time.
#[tauri::command]
#[specta::specta]
pub fn daily_note(state: State<AppState>, date: String, time: String) -> Result<DailyNote> {
    with_folio(&state, |folio| {
        let path = daily_path(&date)?;
        if folio.resolve(&path)?.exists() {
            return Ok(DailyNote {
                path,
                created: false,
            });
        }
        let text = folio
            .template_text(DAILY_TEMPLATE)
            .unwrap_or_else(|| DEFAULT_DAILY.to_string());
        let vars = RenderVars {
            title: date.clone(),
            date: date.clone(),
            time,
        };
        folio.write_note(&path, &render(&text, &vars), None)?;
        Ok(DailyNote {
            path,
            created: true,
        })
    })
}

/// Dates that already have a Daily note, newest first.
#[tauri::command]
#[specta::specta]
pub fn daily_dates(state: State<AppState>) -> Result<Vec<String>> {
    with_folio(&state, |folio| folio.daily_dates())
}
