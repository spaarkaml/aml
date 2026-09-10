//! Bounding and Project commands (WP-2.8).

use tauri::State;

use crate::boundings::{find, slug, Bounding, ProjectInfo, PALETTE};
use crate::folio::{Folio, FolioError, Result};
use crate::state::AppState;

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// Every Bounding in the Folio, in file order.
#[tauri::command]
#[specta::specta]
pub fn boundings_list(state: State<AppState>) -> Result<Vec<Bounding>> {
    with_folio(&state, |folio| folio.boundings())
}

/// Creates a Bounding, giving it the next unused colour from the palette.
#[tauri::command]
#[specta::specta]
pub fn bounding_create(state: State<AppState>, name: String) -> Result<Bounding> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(FolioError::InvalidPath("a Bounding needs a name".into()));
    }
    with_folio(&state, |folio| {
        let mut created = None;
        folio.edit_boundings(|list| {
            let taken: Vec<String> = list.iter().map(|b| b.id.clone()).collect();
            let used: Vec<&str> = list.iter().map(|b| b.colour.as_str()).collect();
            let colour = PALETTE
                .iter()
                .find(|c| !used.contains(c))
                .unwrap_or(&PALETTE[list.len() % PALETTE.len()]);
            let bounding = Bounding {
                id: slug(&name, &taken),
                name: name.clone(),
                colour: (*colour).to_string(),
                icon: String::new(),
                notes: Vec::new(),
            };
            created = Some(bounding.clone());
            list.push(bounding);
            Ok(())
        })?;
        created.ok_or_else(|| FolioError::Io("bounding not created".into()))
    })
}

/// Renames, recolours or re-icons a Bounding. Fields left out are unchanged.
#[tauri::command]
#[specta::specta]
pub fn bounding_update(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    colour: Option<String>,
    icon: Option<String>,
) -> Result<Vec<Bounding>> {
    with_folio(&state, |folio| {
        folio.edit_boundings(|list| {
            let b = find(list, &id)?;
            if let Some(name) = name.as_ref().map(|n| n.trim()) {
                if !name.is_empty() {
                    b.name = name.to_string();
                }
            }
            if let Some(colour) = colour.as_ref() {
                b.colour = colour.clone();
            }
            if let Some(icon) = icon.as_ref() {
                b.icon = icon.chars().take(2).collect();
            }
            Ok(())
        })
    })
}

#[tauri::command]
#[specta::specta]
pub fn bounding_delete(state: State<AppState>, id: String) -> Result<Vec<Bounding>> {
    with_folio(&state, |folio| {
        folio.edit_boundings(|list| {
            let before = list.len();
            list.retain(|b| b.id != id);
            if list.len() == before {
                return Err(FolioError::NotFound(id.clone()));
            }
            Ok(())
        })
    })
}

/// Adds notes to a Bounding. Notes already in it are left where they are.
#[tauri::command]
#[specta::specta]
pub fn bounding_add(
    state: State<AppState>,
    id: String,
    paths: Vec<String>,
) -> Result<Vec<Bounding>> {
    with_folio(&state, |folio| {
        folio.edit_boundings(|list| {
            let b = find(list, &id)?;
            for path in &paths {
                if !b.notes.contains(path) {
                    b.notes.push(path.clone());
                }
            }
            Ok(())
        })
    })
}

#[tauri::command]
#[specta::specta]
pub fn bounding_remove(
    state: State<AppState>,
    id: String,
    paths: Vec<String>,
) -> Result<Vec<Bounding>> {
    with_folio(&state, |folio| {
        folio.edit_boundings(|list| {
            let b = find(list, &id)?;
            b.notes.retain(|n| !paths.contains(n));
            Ok(())
        })
    })
}

/// Every folder in the Folio holding a `project.aml.yaml`.
#[tauri::command]
#[specta::specta]
pub fn projects_list(state: State<AppState>) -> Result<Vec<ProjectInfo>> {
    with_folio(&state, |folio| folio.projects())
}
