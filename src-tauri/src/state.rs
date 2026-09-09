use std::sync::Mutex;

use crate::folio::index::NoteIndex;
use crate::folio::watch::FolioWatcher;
use crate::folio::Folio;
use crate::spell::Speller;

/// Process-wide state managed by Tauri. One Folio open at a time (v1).
#[derive(Default)]
pub struct AppState {
    pub folio: Mutex<Option<Folio>>,
    pub watcher: Mutex<Option<FolioWatcher>>,
    pub index: Mutex<NoteIndex>,
    pub speller: Mutex<Speller>,
}
