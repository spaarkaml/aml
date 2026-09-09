use serde::{Deserialize, Serialize};
use specta::Type;

/// Errors crossing the IPC boundary. Serialised as a tagged enum so the UI can branch on `kind`.
#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum FolioError {
    #[error("no Folio is open")]
    NoFolioOpen,
    #[error("not a Folio: {0}")]
    NotAFolio(String),
    #[error("path not found: {0}")]
    NotFound(String),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("already exists: {0}")]
    AlreadyExists(String),
    #[error("file changed on disk (mtime {disk_mtime}) since it was read")]
    Conflict {
        #[specta(type = specta_typescript::Number)]
        disk_mtime: u64,
    },
    #[error("not UTF-8 text: {0}")]
    NotText(String),
    #[error("I/O error: {0}")]
    Io(String),
}

impl From<std::io::Error> for FolioError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => FolioError::NotFound(e.to_string()),
            std::io::ErrorKind::AlreadyExists => FolioError::AlreadyExists(e.to_string()),
            _ => FolioError::Io(e.to_string()),
        }
    }
}

pub type Result<T> = std::result::Result<T, FolioError>;
