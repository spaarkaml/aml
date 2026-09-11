//! Project commands (WP-5.1): the manifest, the Binder and the cards on it.

use tauri::State;

use crate::folio::{Folio, FolioError, Result};
use crate::project::{project_of, Project, ProjectInfo, LABEL_KEY, STATUS_KEY, SYNOPSIS_KEY};
use crate::state::AppState;

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    f(guard.as_ref().ok_or(FolioError::NoFolioOpen)?)
}

/// Reads the Project at `path`, with the word counts and card properties the index holds.
/// A Folio whose index is still building shows zeroes rather than failing: the Binder's
/// order and structure come from the files, which are always there.
fn read(state: &State<AppState>, path: &str) -> Result<Project> {
    let facts = state
        .index
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|i| i.cards_under(path).ok()))
        .unwrap_or_default();
    with_folio(state, |folio| folio.project(path, &facts))
}

/// Every folder in the Folio holding a `project.aml.yaml`.
#[tauri::command]
#[specta::specta]
pub fn projects_list(state: State<AppState>) -> Result<Vec<ProjectInfo>> {
    with_folio(&state, |folio| folio.projects())
}

#[tauri::command]
#[specta::specta]
pub fn project_read(state: State<AppState>, path: String) -> Result<Project> {
    read(&state, &path)
}

/// Turns a folder into a Project, creating the folder if it is not there yet. Whatever is
/// already in it becomes the Binder, in the Browser's order.
#[tauri::command]
#[specta::specta]
pub fn project_create(state: State<AppState>, path: String, title: String) -> Result<Project> {
    with_folio(&state, |folio| folio.create_project(&path, &title))?;
    read(&state, &path)
}

/// Saves the Project's title and its goal. A field left out is unchanged; an empty target or
/// deadline clears it.
#[tauri::command]
#[specta::specta]
pub fn project_write(
    state: State<AppState>,
    path: String,
    title: Option<String>,
    target: Option<u32>,
    deadline: Option<String>,
) -> Result<Project> {
    with_folio(&state, |folio| {
        folio.edit_manifest(&path, |m| {
            if let Some(title) = title.as_ref().map(|t| t.trim()) {
                if !title.is_empty() {
                    m.title = title.to_string();
                }
            }
            // `Some(0)` and `Some("")` are how the UI says "no goal"; `None` is "leave it".
            if let Some(target) = target {
                m.target = (target > 0).then_some(target);
            }
            if let Some(deadline) = deadline.as_ref().map(|d| d.trim()) {
                m.deadline = (!deadline.is_empty()).then(|| deadline.to_string());
            }
        })
    })?;
    read(&state, &path)
}

/// Sets the Binder order: `order` is the whole Binder, project-relative, in the order it is
/// to be read. Paths the folder does not hold are kept — a note that has not synced yet
/// still has its place waiting.
#[tauri::command]
#[specta::specta]
pub fn project_order(state: State<AppState>, path: String, order: Vec<String>) -> Result<Project> {
    with_folio(&state, |folio| {
        folio.edit_manifest(&path, |m| {
            let mut binder: Vec<String> = Vec::with_capacity(order.len());
            for item in order.iter().chain(m.binder.iter()) {
                let item = item.trim().to_string();
                if !item.is_empty() && !binder.contains(&item) {
                    binder.push(item);
                }
            }
            m.binder = binder;
        })
    })?;
    read(&state, &path)
}

/// Includes or excludes one Binder item from a compile. Excluding a part excludes what is
/// under it, so only the part itself is written down.
#[tauri::command]
#[specta::specta]
pub fn project_include(
    state: State<AppState>,
    path: String,
    item: String,
    include: bool,
) -> Result<Project> {
    with_folio(&state, |folio| {
        folio.edit_manifest(&path, |m| {
            if include {
                m.exclude.retain(|p| p != &item);
            } else if !m.exclude.contains(&item) {
                m.exclude.push(item.clone());
            }
        })
    })?;
    read(&state, &path)
}

/// Writes a card's synopsis, label or status onto the note's own front matter (ADR-004:
/// what belongs to the document lives in the document). A field left out is unchanged; an
/// empty one is removed from the note.
#[tauri::command]
#[specta::specta]
pub fn project_card_write(
    state: State<AppState>,
    path: String,
    note: String,
    synopsis: Option<String>,
    label: Option<String>,
    status: Option<String>,
) -> Result<Project> {
    let mut pairs: Vec<(&str, &str)> = Vec::new();
    if let Some(v) = synopsis.as_deref() {
        pairs.push((SYNOPSIS_KEY, v));
    }
    if let Some(v) = label.as_deref() {
        pairs.push((LABEL_KEY, v));
    }
    if let Some(v) = status.as_deref() {
        pairs.push((STATUS_KEY, v));
    }
    let written = with_folio(&state, |folio| folio.write_card(&note, &pairs))?;

    // The index has not seen the write yet — the watcher is still on its way — so the row
    // for the note just edited is overlaid with what was actually written to it. Everything
    // else on screen still comes from the index.
    let mut project = read(&state, &path)?;
    for item in project.binder.iter_mut().filter(|i| i.path == note) {
        item.synopsis = written.0.clone();
        item.label = written.1.clone();
        item.status = written.2.clone();
    }
    Ok(project)
}

/// The Project folder a note belongs to, or null — the innermost one when they nest.
#[tauri::command]
#[specta::specta]
pub fn project_of_note(state: State<AppState>, path: String) -> Result<Option<String>> {
    with_folio(&state, |folio| Ok(project_of(&folio.projects()?, &path)))
}
