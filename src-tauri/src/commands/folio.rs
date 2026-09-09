use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};

use crate::folio::{watch, Folio, FolioError, FolioInfo, NoteContent, NoteMeta, Result, TreeNode};
use crate::state::AppState;

const RECENT_FILE: &str = "recent-folios.json";
const RECENT_MAX: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentFolio {
    pub path: String,
    pub name: String,
    #[specta(type = specta_typescript::Number)]
    pub last_opened: u64,
}

fn with_folio<T>(state: &State<AppState>, f: impl FnOnce(&Folio) -> Result<T>) -> Result<T> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let folio = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    f(folio)
}

fn recent_path(app: &AppHandle) -> Result<std::path::PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(RECENT_FILE))
}

fn load_recent(app: &AppHandle) -> Vec<RecentFolio> {
    recent_path(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn remember(app: &AppHandle, folio: &Folio) -> Result<()> {
    let info = folio.info();
    let mut list = load_recent(app);
    list.retain(|r| r.path != info.root);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    list.insert(
        0,
        RecentFolio {
            path: info.root,
            name: info.name,
            last_opened: now,
        },
    );
    list.truncate(RECENT_MAX);
    let bytes = serde_json::to_vec_pretty(&list).map_err(|e| FolioError::Io(e.to_string()))?;
    crate::folio::write_atomic(&recent_path(app)?, &bytes)
}

fn install(app: &AppHandle, state: &State<AppState>, folio: Folio) -> Result<FolioInfo> {
    let watcher = watch::start(app.clone(), &folio)?;
    let info = folio.info();
    remember(app, &folio)?;
    *state
        .watcher
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))? = Some(watcher);
    *state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))? = Some(folio);
    log::info!("opened Folio {} ({} notes)", info.root, info.note_count);
    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub fn folio_open(app: AppHandle, state: State<AppState>, path: String) -> Result<FolioInfo> {
    let folio = Folio::open(Path::new(&path))?;
    install(&app, &state, folio)
}

#[tauri::command]
#[specta::specta]
pub fn folio_create(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    name: Option<String>,
) -> Result<FolioInfo> {
    let folio = Folio::create(Path::new(&path), name.as_deref())?;
    install(&app, &state, folio)
}

#[tauri::command]
#[specta::specta]
pub fn folio_close(state: State<AppState>) -> Result<()> {
    *state
        .watcher
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))? = None;
    *state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))? = None;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn folio_current(state: State<AppState>) -> Result<Option<FolioInfo>> {
    let guard = state
        .folio
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    Ok(guard.as_ref().map(Folio::info))
}

#[tauri::command]
#[specta::specta]
pub fn folio_recent(app: AppHandle) -> Vec<RecentFolio> {
    load_recent(&app)
}

#[tauri::command]
#[specta::specta]
pub fn folio_tree(state: State<AppState>) -> Result<Vec<TreeNode>> {
    with_folio(&state, Folio::tree)
}

#[tauri::command]
#[specta::specta]
pub fn note_read(state: State<AppState>, path: String) -> Result<NoteContent> {
    with_folio(&state, |f| f.read_note(&path))
}

#[tauri::command]
#[specta::specta]
pub fn note_write(
    state: State<AppState>,
    path: String,
    text: String,
    // f64 because specta forbids u64 in command arguments; ms timestamps fit in 2^53.
    expected_mtime: Option<f64>,
) -> Result<NoteMeta> {
    with_folio(&state, |f| {
        f.write_note(&path, &text, expected_mtime.map(|m| m as u64))
    })
}

#[tauri::command]
#[specta::specta]
pub fn entry_create_note(state: State<AppState>, path: String) -> Result<NoteMeta> {
    with_folio(&state, |f| f.create_note(&path))
}

#[tauri::command]
#[specta::specta]
pub fn entry_create_folder(state: State<AppState>, path: String) -> Result<()> {
    with_folio(&state, |f| f.create_folder(&path))
}

#[tauri::command]
#[specta::specta]
pub fn entry_rename(state: State<AppState>, from: String, to: String) -> Result<()> {
    with_folio(&state, |f| f.rename(&from, &to))
}

#[tauri::command]
#[specta::specta]
pub fn entry_trash(state: State<AppState>, path: String) -> Result<()> {
    with_folio(&state, |f| f.trash(&path))
}
