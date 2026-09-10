use std::path::Path;

use tauri::{AppHandle, Manager, State};

use crate::folio::{FolioError, Result};
use crate::sidecar::syncthing::{folder_id_for, SyncSettings, SyncStatus, Syncthing};
use crate::state::AppState;

fn with_sync<T>(
    app: &AppHandle,
    state: &State<AppState>,
    f: impl FnOnce(&mut Syncthing) -> Result<T>,
) -> Result<T> {
    let mut guard = state
        .syncthing
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    if guard.is_none() {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|e| FolioError::Io(e.to_string()))?;
        *guard = Some(Syncthing::new(&data)?);
    }
    f(guard.as_mut().expect("sidecar just created"))
}

/// Everything the Sync screen and the status bar show; polled by the UI.
#[tauri::command]
#[specta::specta]
pub fn sync_status(app: AppHandle, state: State<AppState>) -> Result<SyncStatus> {
    with_sync(&app, &state, |s| {
        let enabled = s.settings().enabled;
        Ok(s.status(enabled))
    })
}

/// Starts the sidecar now and remembers to start it on every launch.
#[tauri::command]
#[specta::specta]
pub fn sync_enable(app: AppHandle, state: State<AppState>) -> Result<SyncStatus> {
    with_sync(&app, &state, |s| {
        s.save_settings(&SyncSettings { enabled: true })?;
        s.start()?;
        Ok(s.status(true))
    })
}

/// Stops the sidecar and stops auto-starting it. Existing pairing/config is kept.
#[tauri::command]
#[specta::specta]
pub fn sync_disable(app: AppHandle, state: State<AppState>) -> Result<SyncStatus> {
    with_sync(&app, &state, |s| {
        s.save_settings(&SyncSettings { enabled: false })?;
        s.stop();
        Ok(s.status(false))
    })
}

#[tauri::command]
#[specta::specta]
pub fn sync_add_device(
    app: AppHandle,
    state: State<AppState>,
    device_id: String,
    name: String,
    address: Option<String>,
) -> Result<SyncStatus> {
    let id = device_id.trim().to_uppercase();
    if id.len() < 50 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(FolioError::InvalidPath(
            "That does not look like a Syncthing Device ID (7 groups of 7 characters)".into(),
        ));
    }
    with_sync(&app, &state, |s| {
        s.start()?;
        s.add_device(
            &id,
            if name.trim().is_empty() { "NAS" } else { &name },
            address.as_deref(),
        )?;
        Ok(s.status(true))
    })
}

#[tauri::command]
#[specta::specta]
pub fn sync_remove_device(
    app: AppHandle,
    state: State<AppState>,
    device_id: String,
) -> Result<SyncStatus> {
    with_sync(&app, &state, |s| {
        s.remove_device(&device_id)?;
        Ok(s.status(s.settings().enabled))
    })
}

/// Accepts a folder the NAS offered, placing it at `path` on this machine.
#[tauri::command]
#[specta::specta]
pub fn sync_accept_folder(
    app: AppHandle,
    state: State<AppState>,
    folder_id: String,
    label: String,
    path: String,
    device_id: String,
) -> Result<SyncStatus> {
    with_sync(&app, &state, |s| {
        s.set_folder(&folder_id, &label, Path::new(&path), &[device_id])?;
        Ok(s.status(true))
    })
}

/// Offers a local folder (normally an open Folio) to the NAS. The NAS then has to accept it
/// in its own Syncthing UI, choosing where to keep it.
#[tauri::command]
#[specta::specta]
pub fn sync_share_folder(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    device_id: String,
    label: Option<String>,
) -> Result<SyncStatus> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(FolioError::NotFound(path.clone()));
    }
    let name = label.unwrap_or_else(|| {
        p.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Folio".into())
    });
    with_sync(&app, &state, |s| {
        s.set_folder(&folder_id_for(&name), &name, p, &[device_id])?;
        Ok(s.status(true))
    })
}

/// True when `path` is (inside) a folder the sidecar syncs — used to mark a Folio "Synced".
#[tauri::command]
#[specta::specta]
pub fn sync_is_synced_path(app: AppHandle, state: State<AppState>, path: String) -> Result<bool> {
    with_sync(&app, &state, |s| {
        let st = s.status(s.settings().enabled);
        Ok(st.folders.iter().any(|f| {
            let fp = Path::new(&f.path);
            Path::new(&path).starts_with(fp)
        }))
    })
}

#[tauri::command]
#[specta::specta]
pub fn sync_log_tail(app: AppHandle, state: State<AppState>) -> Result<Vec<String>> {
    with_sync(&app, &state, |s| Ok(s.log_tail(40)))
}

/// Called from `lib.rs` at start-up: bring the sidecar up if the user enabled sync.
pub fn autostart(app: &AppHandle) {
    let state: State<AppState> = app.state();
    let r = with_sync(app, &state, |s| {
        if s.settings().enabled {
            s.start()?;
        }
        Ok(())
    });
    if let Err(e) = r {
        log::warn!("sync autostart failed: {e}");
    }
}

/// Called on exit: stop the sidecar we started.
pub fn shutdown(app: &AppHandle) {
    let state: State<AppState> = app.state();
    let guard = state.syncthing.lock();
    if let Ok(mut guard) = guard {
        if let Some(s) = guard.as_mut() {
            s.stop();
        }
    }
}
