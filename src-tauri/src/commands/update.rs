//! Checking for and installing an update (WP-8.2).
//!
//! Two commands, in the order the screen uses them: `update_check` asks the endpoint what the
//! newest release is and remembers it; `update_install` downloads that release, verifies its
//! signature and restarts into it. Nothing is downloaded until the second one is called, so
//! the check that runs at launch costs a few kilobytes of JSON and no disk.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::update::{describe, Pending, Phase, Result, Throttle, UpdateError, UpdateInfo};

/// Emitted while the update downloads. `total` is absent until the server declares a length.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    #[specta(type = specta_typescript::Number)]
    pub downloaded: u64,
    #[specta(type = Option<specta_typescript::Number>)]
    pub total: Option<u64>,
    /// True on the last event of a download, when the bytes are all in.
    pub done: bool,
}

/// The release the endpoint is offering, or `None` when this is already the newest one.
///
/// A debug build refuses outright: it was built by `cargo`, not by the bundler, so there is no
/// installed bundle for an update to replace and "installing" one would break the dev copy.
#[tauri::command]
#[specta::specta]
pub async fn update_check(
    app: AppHandle,
    pending: State<'_, Pending>,
) -> Result<Option<UpdateInfo>> {
    if cfg!(debug_assertions) {
        return Err(UpdateError::NotConfigured);
    }
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| describe(&e, Phase::Check))?;
    let found = updater
        .check()
        .await
        .map_err(|e| describe(&e, Phase::Check))?;
    let Some(update) = found else {
        *pending.0.lock().expect("pending lock") = None;
        log::info!(
            "update check: {} is the newest release",
            app.package_info().version
        );
        return Ok(None);
    };
    let info = UpdateInfo {
        version: update.version.clone(),
        current: update.current_version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        // The plugin parses the date into a `time` value; the string we published is still in
        // the raw response, and reading it back beats taking a dependency to reformat it.
        date: update
            .raw_json
            .get("pub_date")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    };
    log::info!("update available: {} → {}", info.current, info.version);
    *pending.0.lock().expect("pending lock") = Some(update);
    Ok(Some(info))
}

/// Downloads the update found by `update_check`, verifies it and restarts into it.
///
/// On macOS this returns only if something went wrong — a good run ends in `restart`. On
/// Windows the installer takes over and relaunches AML itself.
#[tauri::command]
#[specta::specta]
pub async fn update_install(app: AppHandle, pending: State<'_, Pending>) -> Result<()> {
    // Cloned out of the lock rather than held across the download: a mutex guard is not Send,
    // and holding this one would block every other command for the length of a download.
    let update = pending
        .0
        .lock()
        .expect("pending lock")
        .clone()
        .ok_or(UpdateError::NothingPending)?;

    let mut throttle = Throttle::new();
    let mut downloaded: u64 = 0;
    let emit = |app: &AppHandle, downloaded: u64, total: Option<u64>, done: bool| {
        if let Err(e) = (UpdateProgress {
            downloaded,
            total,
            done,
        })
        .emit(app)
        {
            log::warn!("failed to emit UpdateProgress: {e}");
        }
    };

    let handle = app.clone();
    let finished = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                if throttle.ready(false, std::time::Instant::now()) {
                    emit(&handle, downloaded, total, false);
                }
            },
            move || emit(&finished, 0, None, true),
        )
        .await
        .map_err(|e| describe(&e, Phase::Install))?;

    log::info!("update {} installed; restarting", update.version);
    *pending.0.lock().expect("pending lock") = None;
    app.restart();
}
