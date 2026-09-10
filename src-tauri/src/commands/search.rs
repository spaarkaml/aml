//! Search commands (WP-2.5).

use tauri::State;

use crate::folio::{FolioError, Result};
use crate::index::search::SearchResponse;
use crate::state::AppState;

/// Runs a query in the search language (see `index/search.rs`).
#[tauri::command]
#[specta::specta]
pub fn search_query(
    state: State<AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<SearchResponse> {
    let guard = state
        .index
        .lock()
        .map_err(|e| FolioError::Io(e.to_string()))?;
    let index = guard.as_ref().ok_or(FolioError::NoFolioOpen)?;
    index.search_query(&query, limit.unwrap_or(200) as usize)
}
