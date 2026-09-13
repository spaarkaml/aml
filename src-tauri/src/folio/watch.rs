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

/// Whether a changed path is worth telling the UI about.
///
/// Hidden and temporary names are dropped — except a Syncthing conflict copy, which is hidden
/// from the Browser and the index but is exactly the change the Conflicts screen is waiting
/// for, even when it lands inside `.aml/` (a Boundings file can conflict like any note).
pub(crate) fn passes(path: &Path) -> bool {
    let names: Vec<String> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    if names.iter().any(|n| n.starts_with(super::TMP_PREFIX)) {
        return false;
    }
    let is_copy = names
        .last()
        .is_some_and(|n| crate::conflicts::is_conflict_name(n));
    is_copy || !names.iter().any(|n| is_ignored_name(n))
}

pub fn start(app: AppHandle, folio: &Folio) -> Result<FolioWatcher> {
    let folio = Arc::new(folio.clone());
    let handler = {
        let folio = Arc::clone(&folio);
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let mut paths: Vec<String> = events
                    .iter()
                    .flat_map(|e| e.paths.iter())
                    .filter(|p| passes(p))
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

#[cfg(test)]
mod tests {
    use super::passes;
    use std::path::Path;

    #[test]
    fn conflict_copies_are_reported_even_where_other_hidden_files_are_not() {
        assert!(passes(Path::new("/f/Thesis/a.md")));
        assert!(!passes(Path::new("/f/.aml/boundings.yaml")));
        assert!(!passes(Path::new("/f/.DS_Store")));
        assert!(passes(Path::new(
            "/f/Thesis/a.sync-conflict-20260913-101112-ABC2DEF.md"
        )));
        assert!(passes(Path::new(
            "/f/.aml/boundings.sync-conflict-20260913-101112-ABC2DEF.yaml"
        )));
        assert!(!passes(Path::new(
            "/f/Thesis/.aml-tmp-1.sync-conflict-20260913-101112-ABC2DEF.md"
        )));
    }
}
