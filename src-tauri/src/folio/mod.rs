//! A Folio is a folder on disk with an `.aml/` directory inside it (ADR-004, ADR-011).
//! All paths crossing IPC are Folio-relative, forward-slash separated, and validated by
//! [`Folio::resolve`] so the UI can never reach outside the root.

pub mod error;
pub mod watch;

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;

pub use error::{FolioError, Result};

pub const AML_DIR: &str = ".aml";
const CONFIG_FILE: &str = "config.yaml";
const TMP_PREFIX: &str = ".aml-tmp-";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolioInfo {
    pub root: String,
    pub name: String,
    pub note_count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Folder,
    Note,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    /// Folio-relative path with forward slashes, e.g. `Thesis/chapters/03.md`.
    pub path: String,
    pub kind: EntryKind,
    #[specta(type = specta_typescript::Number)]
    pub mtime: u64,
    #[specta(type = specta_typescript::Number)]
    pub size: u64,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub path: String,
    pub text: String,
    #[specta(type = specta_typescript::Number)]
    pub mtime: u64,
    #[specta(type = specta_typescript::Number)]
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub path: String,
    #[specta(type = specta_typescript::Number)]
    pub mtime: u64,
    #[specta(type = specta_typescript::Number)]
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct Folio {
    root: PathBuf,
    name: String,
}

pub fn is_ignored_name(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name.starts_with(TMP_PREFIX)
}

pub fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Folio {
    /// Opens an existing Folio (a directory containing `.aml/`).
    pub fn open(path: &Path) -> Result<Self> {
        let root = path.to_path_buf();
        if !root.is_dir() {
            return Err(FolioError::NotFound(root.display().to_string()));
        }
        if !root.join(AML_DIR).is_dir() {
            return Err(FolioError::NotAFolio(root.display().to_string()));
        }
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Folio".to_string());
        Ok(Self { root, name })
    }

    /// Initialises `.aml/` inside `path` (creating the directory if needed) and opens it.
    pub fn create(path: &Path, name: Option<&str>) -> Result<Self> {
        fs::create_dir_all(path)?;
        let aml = path.join(AML_DIR);
        if aml.is_dir() {
            return Err(FolioError::AlreadyExists(aml.display().to_string()));
        }
        fs::create_dir_all(aml.join("snapshots"))?;
        let display_name = name
            .map(str::to_string)
            .or_else(|| path.file_name().map(|n| n.to_string_lossy().to_string()))
            .unwrap_or_else(|| "Folio".to_string());
        let config =
            format!("# AML Folio configuration (ADR-004)\nversion: 1\nname: {display_name}\n");
        write_atomic(&aml.join(CONFIG_FILE), config.as_bytes())?;
        write_atomic(
            &path.join(".stignore"),
            b"// Syncthing ignore file written by AML (ADR-005)\n.DS_Store\nThumbs.db\ndesktop.ini\n*.aml-tmp-*\n(?d).sync-conflict-*.aml-tmp-*\n",
        )?;
        Self::open(path)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn info(&self) -> FolioInfo {
        let note_count = count_notes(&self.root);
        FolioInfo {
            root: self.root.display().to_string(),
            name: self.name.clone(),
            note_count,
        }
    }

    /// Validates a Folio-relative path and returns the absolute path.
    /// Rejects absolute paths, `..`, empty segments and anything inside `.aml/`.
    pub fn resolve(&self, rel: &str) -> Result<PathBuf> {
        if rel.is_empty() || rel == "." {
            return Ok(self.root.clone());
        }
        let p = Path::new(rel);
        if p.is_absolute() || rel.starts_with('/') || rel.starts_with('\\') {
            return Err(FolioError::InvalidPath(rel.to_string()));
        }
        let mut out = self.root.clone();
        for c in p.components() {
            match c {
                Component::Normal(seg) => {
                    let s = seg.to_string_lossy();
                    if s == AML_DIR && out == self.root {
                        return Err(FolioError::InvalidPath(rel.to_string()));
                    }
                    out.push(seg);
                }
                Component::CurDir => {}
                _ => return Err(FolioError::InvalidPath(rel.to_string())),
            }
        }
        Ok(out)
    }

    pub fn relative(&self, abs: &Path) -> Option<String> {
        abs.strip_prefix(&self.root).ok().map(|p| {
            p.components()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("/")
        })
    }

    pub fn tree(&self) -> Result<Vec<TreeNode>> {
        read_dir_sorted(&self.root, "")
    }

    pub fn read_note(&self, rel: &str) -> Result<NoteContent> {
        let abs = self.resolve(rel)?;
        let meta = fs::metadata(&abs)?;
        let bytes = fs::read(&abs)?;
        let text = decode_text(bytes).ok_or_else(|| FolioError::NotText(rel.to_string()))?;
        Ok(NoteContent {
            path: rel.to_string(),
            text,
            mtime: mtime_ms(&meta),
            size: meta.len(),
        })
    }

    /// Atomic write with optional conflict check against the mtime the caller last saw.
    pub fn write_note(
        &self,
        rel: &str,
        text: &str,
        expected_mtime: Option<u64>,
    ) -> Result<NoteMeta> {
        let abs = self.resolve(rel)?;
        if let (Some(expected), Ok(meta)) = (expected_mtime, fs::metadata(&abs)) {
            let disk = mtime_ms(&meta);
            if disk != expected {
                return Err(FolioError::Conflict { disk_mtime: disk });
            }
        }
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(&abs, text.as_bytes())?;
        let meta = fs::metadata(&abs)?;
        Ok(NoteMeta {
            path: rel.to_string(),
            mtime: mtime_ms(&meta),
            size: meta.len(),
        })
    }

    pub fn create_note(&self, rel: &str) -> Result<NoteMeta> {
        let abs = self.resolve(rel)?;
        if abs.exists() {
            return Err(FolioError::AlreadyExists(rel.to_string()));
        }
        self.write_note(rel, "", None)
    }

    pub fn create_folder(&self, rel: &str) -> Result<()> {
        let abs = self.resolve(rel)?;
        if abs.exists() {
            return Err(FolioError::AlreadyExists(rel.to_string()));
        }
        fs::create_dir_all(abs)?;
        Ok(())
    }

    /// Renames or moves an entry. `to` is the full new relative path.
    pub fn rename(&self, from: &str, to: &str) -> Result<()> {
        let src = self.resolve(from)?;
        let dst = self.resolve(to)?;
        if !src.exists() {
            return Err(FolioError::NotFound(from.to_string()));
        }
        if dst.exists() && !same_path_case_insensitive(&src, &dst) {
            return Err(FolioError::AlreadyExists(to.to_string()));
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(src, dst)?;
        Ok(())
    }

    /// Moves an entry to the OS trash / recycle bin — never a hard delete.
    pub fn trash(&self, rel: &str) -> Result<()> {
        let abs = self.resolve(rel)?;
        if !abs.exists() {
            return Err(FolioError::NotFound(rel.to_string()));
        }
        trash::delete(&abs).map_err(|e| FolioError::Io(e.to_string()))
    }
}

fn same_path_case_insensitive(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

fn decode_text(bytes: Vec<u8>) -> Option<String> {
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        bytes[3..].to_vec()
    } else {
        bytes
    };
    String::from_utf8(bytes).ok()
}

/// Writes `data` to a temp file beside `target`, fsyncs, then renames over `target`.
pub fn write_atomic(target: &Path, data: &[u8]) -> Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| FolioError::InvalidPath(target.display().to_string()))?;
    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = dir.join(format!("{TMP_PREFIX}{nonce}-{file_name}"));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
    }
    if let Err(e) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

fn read_dir_sorted(dir: &Path, rel_prefix: &str) -> Result<Vec<TreeNode>> {
    let mut nodes = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_name(&name) {
            continue;
        }
        let meta = entry.metadata()?;
        let path = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };
        if meta.is_dir() {
            let children = read_dir_sorted(&entry.path(), &path)?;
            nodes.push(TreeNode {
                name,
                path,
                kind: EntryKind::Folder,
                mtime: mtime_ms(&meta),
                size: 0,
                children,
            });
        } else {
            let kind = if name.to_lowercase().ends_with(".md") {
                EntryKind::Note
            } else {
                EntryKind::File
            };
            nodes.push(TreeNode {
                name,
                path,
                kind,
                mtime: mtime_ms(&meta),
                size: meta.len(),
                children: vec![],
            });
        }
    }
    nodes.sort_by(|a, b| {
        let ka = a.kind != EntryKind::Folder;
        let kb = b.kind != EntryKind::Folder;
        ka.cmp(&kb)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

fn count_notes(dir: &Path) -> u32 {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(dir) {
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if is_ignored_name(&name) {
                continue;
            }
            let p = entry.path();
            if p.is_dir() {
                n += count_notes(&p);
            } else if name.to_lowercase().ends_with(".md") {
                n += 1;
            }
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_folio() -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Test")).unwrap();
        (dir, folio)
    }

    #[test]
    fn create_then_open() {
        let (dir, _) = temp_folio();
        assert!(dir.path().join(".aml/config.yaml").is_file());
        assert!(dir.path().join(".stignore").is_file());
        let f = Folio::open(dir.path()).unwrap();
        assert_eq!(f.info().note_count, 0);
        assert!(matches!(
            Folio::create(dir.path(), None),
            Err(FolioError::AlreadyExists(_))
        ));
    }

    #[test]
    fn open_requires_aml_dir() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            Folio::open(dir.path()),
            Err(FolioError::NotAFolio(_))
        ));
        assert!(matches!(
            Folio::open(&dir.path().join("nope")),
            Err(FolioError::NotFound(_))
        ));
    }

    #[test]
    fn resolve_rejects_escapes() {
        let (_d, f) = temp_folio();
        assert!(f.resolve("../x.md").is_err());
        assert!(f.resolve("a/../../x.md").is_err());
        assert!(f.resolve("/etc/passwd").is_err());
        assert!(f.resolve(".aml/config.yaml").is_err());
        assert!(f.resolve("notes/../notes/x.md").is_err());
        assert!(f.resolve("notes/./x.md").is_ok());
        assert_eq!(f.resolve("").unwrap(), f.root());
    }

    #[test]
    fn write_read_roundtrip_and_tree() {
        let (_d, f) = temp_folio();
        f.create_folder("Thesis/chapters").unwrap();
        let meta = f
            .write_note("Thesis/chapters/03 Influence.md", "# Hi\n\ncolour\n", None)
            .unwrap();
        f.write_note("zeta.md", "z", None).unwrap();
        f.write_note("Thesis/notes.txt", "not a note", None)
            .unwrap();
        let note = f.read_note("Thesis/chapters/03 Influence.md").unwrap();
        assert_eq!(note.text, "# Hi\n\ncolour\n");
        assert_eq!(note.mtime, meta.mtime);
        let tree = f.tree().unwrap();
        assert_eq!(tree[0].name, "Thesis");
        assert_eq!(tree[0].kind, EntryKind::Folder);
        assert_eq!(tree[0].children[0].name, "chapters");
        assert_eq!(tree[0].children[1].kind, EntryKind::File);
        assert_eq!(tree[1].name, "zeta.md");
        assert_eq!(f.info().note_count, 2);
        // hidden and temp files are ignored
        f.write_note(".hidden.md", "x", None).unwrap();
        assert_eq!(f.tree().unwrap().len(), 2);
    }

    #[test]
    fn write_detects_conflict() {
        let (_d, f) = temp_folio();
        let m = f.write_note("a.md", "one", None).unwrap();
        assert!(f.write_note("a.md", "two", Some(m.mtime)).is_ok());
        assert!(matches!(
            f.write_note("a.md", "three", Some(1)),
            Err(FolioError::Conflict { .. })
        ));
        assert_eq!(f.read_note("a.md").unwrap().text, "two");
    }

    #[test]
    fn write_is_atomic_leaves_no_temp_files() {
        let (_d, f) = temp_folio();
        for i in 0..20 {
            f.write_note("a.md", &format!("version {i}"), None).unwrap();
        }
        let leftovers: Vec<_> = fs::read_dir(f.root())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(TMP_PREFIX))
            .collect();
        assert!(leftovers.is_empty());
        assert_eq!(f.read_note("a.md").unwrap().text, "version 19");
    }

    #[test]
    fn bom_is_stripped_on_read() {
        let (_d, f) = temp_folio();
        write_atomic(&f.resolve("b.md").unwrap(), b"\xEF\xBB\xBF# BOM\n").unwrap();
        assert_eq!(f.read_note("b.md").unwrap().text, "# BOM\n");
    }

    #[test]
    fn rename_and_create_rules() {
        let (_d, f) = temp_folio();
        f.create_note("a.md").unwrap();
        assert!(matches!(
            f.create_note("a.md"),
            Err(FolioError::AlreadyExists(_))
        ));
        f.rename("a.md", "sub/b.md").unwrap();
        assert!(f.read_note("sub/b.md").is_ok());
        assert!(matches!(
            f.rename("missing.md", "x.md"),
            Err(FolioError::NotFound(_))
        ));
        f.create_note("c.md").unwrap();
        assert!(matches!(
            f.rename("c.md", "sub/b.md"),
            Err(FolioError::AlreadyExists(_))
        ));
        // case-only rename is allowed
        f.rename("c.md", "C.md").unwrap();
    }
}
