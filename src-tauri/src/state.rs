use std::sync::atomic::AtomicBool;
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
    /// Set while the sidecar is booting. `Syncthing::start` blocks for up to 20 s holding the
    /// mutex above, so a status poll during launch would queue behind it and the status bar
    /// would show nothing at all — exactly when the user most wants to be told it is working.
    pub sync_starting: AtomicBool,
}
