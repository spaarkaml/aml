//! File watching for Local/Synced Folios (ADR-005): OS events, debounced, mapped to
//! Folio-relative paths and emitted to the UI as a single `FolioChanged` event.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use super::{is_ignored_name, Folio, FolioError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct FolioChanged {
    /// Folio-relative paths that changed (created, modified, removed or renamed).
    pub paths: Vec<String>,
}

pub type FolioWatcher = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

pub fn start(app: AppHandle, folio: &Folio) -> Result<FolioWatcher> {
    let folio = Arc::new(folio.clone());
    let handler = {
        let folio = Arc::clone(&folio);
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let mut paths: Vec<String> = events
                    .iter()
                    .flat_map(|e| e.paths.iter())
                    .filter(|p| {
                        !p.components()
                            .any(|c| is_ignored_name(&c.as_os_str().to_string_lossy()))
                    })
                    .filter_map(|p| folio.relative(p))
                    .collect();
                paths.sort();
                paths.dedup();
                if paths.is_empty() {
                    return;
                }
                // Keep the index current before the UI hears about the change, so anything
                // it re-queries (Quick Open, panels) already sees the new state.
                crate::commands::index::apply_changes(&app, &paths);
                if let Err(e) = (FolioChanged { paths }).emit(&app) {
                    log::warn!("failed to emit FolioChanged: {e}");
                }
            }
            Err(errors) => {
                for e in errors {
                    log::warn!("watch error: {e}");
                }
            }
        }
    };
    let mut debouncer = new_debouncer(Duration::from_millis(300), None, handler)
        .map_err(|e| FolioError::Io(e.to_string()))?;
    debouncer
        .watch(Path::new(folio.root()), RecursiveMode::Recursive)
        .map_err(|e| FolioError::Io(e.to_string()))?;
    Ok(debouncer)
}
