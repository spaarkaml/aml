use std::sync::Mutex;

use crate::folio::watch::FolioWatcher;
use crate::folio::Folio;
use crate::index::Index;
use crate::sidecar::syncthing::Syncthing;
use crate::spell::Speller;

/// Process-wide state managed by Tauri. One Folio open at a time (v1).
#[derive(Default)]
pub struct AppState {
    pub folio: Mutex<Option<Folio>>,
    pub watcher: Mutex<Option<FolioWatcher>>,
    /// SQLite index of the open Folio (ADR-007); `None` until a Folio is open.
    pub index: Mutex<Option<Index>>,
    pub speller: Mutex<Speller>,
    /// Created lazily on first use (needs the app-data path).
    pub syncthing: Mutex<Option<Syncthing>>,
}
