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

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    /// Folio-relative path of the stored file.
    pub path: String,
    /// Path to write into the note (relative to the note's directory, forward slashes).
    pub markdown_path: String,
    pub absolute: String,
    #[specta(type = specta_typescript::Number)]
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct Folio {
    root: PathBuf,
    name: String,
}

/// Names the Browser, the note count and the index never show. A Syncthing conflict copy is
/// one of them: it is not a note of its own, and the Conflicts screen is where it is shown
/// (WP-4.2). The watcher lets copies through regardless — see `watch::passes`.
pub fn is_ignored_name(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name.starts_with(TMP_PREFIX)
        || crate::conflicts::is_conflict_name(name)
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
        // A Folio created before 2026-09-12 carries a `.stignore` that stops Syncthing ever
        // removing a folder deleted on the other machine. Opening it is the moment to fix it.
        if let Err(e) = upgrade_stignore(&root) {
            log::warn!("could not update .stignore: {e}");
        }
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
            crate::sidecar::syncthing::STIGNORE.as_bytes(),
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
        // The version about to be replaced, kept by the Snapshot rule (ADR-006, WP-4.1).
        crate::snapshots::before_write(&self.root, rel);
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
        // A note's history goes where the note goes.
        if let Err(e) = crate::snapshots::move_history(&self.root, from, to) {
            log::warn!("could not move the snapshots of {from}: {e}");
        }
        Ok(())
    }

    /// Stores an image/attachment for `note_rel` and returns the path to reference from the
    /// note (relative to the note's directory). Assets live in `assets/` inside the note's
    /// top-level folder, or `<Folio>/assets/` for notes at the root (Q12).
    pub fn write_asset(&self, note_rel: &str, file_name: &str, bytes: &[u8]) -> Result<AssetInfo> {
        let note_abs = self.resolve(note_rel)?;
        let top = Path::new(note_rel)
            .components()
            .next()
            .and_then(|c| match c {
                Component::Normal(s) => Some(s.to_string_lossy().to_string()),
                _ => None,
            });
        let assets_rel = match top {
            Some(t) if Path::new(note_rel).components().count() > 1 => format!("{t}/assets"),
            _ => "assets".to_string(),
        };
        let assets_abs = self.resolve(&assets_rel)?;
        fs::create_dir_all(&assets_abs)?;
        let safe_name = sanitise_file_name(file_name);
        let stamp = chrono_stamp();
        let stored = format!("{stamp}-{safe_name}");
        let abs = assets_abs.join(&stored);
        write_atomic(&abs, bytes)?;
        let note_dir = note_abs.parent().unwrap_or(&self.root);
        let rel_from_note = relative_path(note_dir, &abs);
        Ok(AssetInfo {
            path: format!("{assets_rel}/{stored}"),
            markdown_path: rel_from_note,
            absolute: abs.display().to_string(),
            size: bytes.len() as u64,
        })
    }

    /// Copies an existing file (picked in a dialog) into the assets folder for `note_rel`.
    pub fn import_asset(&self, note_rel: &str, source: &Path) -> Result<AssetInfo> {
        let bytes = fs::read(source)?;
        let name = source
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        self.write_asset(note_rel, &name, &bytes)
    }

    /// Absolute path for an asset referenced from a note (for display via the asset protocol).
    pub fn resolve_from_note(&self, note_rel: &str, target: &str) -> Result<PathBuf> {
        let note_abs = self.resolve(note_rel)?;
        let base = note_abs.parent().unwrap_or(&self.root).to_path_buf();
        let joined = base.join(target);
        let normalised = normalise_lexically(&joined);
        if !normalised.starts_with(&self.root) {
            return Err(FolioError::InvalidPath(target.to_string()));
        }
        Ok(normalised)
    }

    /// Reads an asset a note references, as text.
    ///
    /// Diagrams (WP-7.1) are SVG files carrying their own model in a `<metadata>` block, so
    /// re-opening one for editing means reading the file the note points at. Guarded by the
    /// same path check as every other asset call: a note cannot reach outside the Folio.
    pub fn read_asset_text(&self, note_rel: &str, target: &str) -> Result<String> {
        let abs = self.resolve_from_note(note_rel, target)?;
        if !abs.exists() {
            return Err(FolioError::NotFound(target.to_string()));
        }
        Ok(fs::read_to_string(abs)?)
    }

    /// Overwrites an asset a note already references, in place.
    ///
    /// Editing a diagram has to keep the same file: the note's markdown points at it, and
    /// writing a new file each time would leave the old one orphaned in `assets/` and the
    /// link pointing at a stale drawing.
    pub fn write_asset_text(&self, note_rel: &str, target: &str, text: &str) -> Result<()> {
        let abs = self.resolve_from_note(note_rel, target)?;
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(&abs, text.as_bytes())
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

fn sanitise_file_name(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let mut collapsed = String::with_capacity(cleaned.len());
    for c in cleaned.chars() {
        if c == '-' && collapsed.ends_with('-') {
            continue;
        }
        collapsed.push(c);
    }
    let trimmed = collapsed.trim_matches('-').to_lowercase();
    if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed
    }
}

fn chrono_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Civil date from epoch seconds (no chrono dependency needed).
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days as i64);
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Howard Hinnant's algorithm: days since 1970-01-01 → (year, month, day).
pub(crate) fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn relative_path(from_dir: &Path, to: &Path) -> String {
    let from: Vec<_> = from_dir.components().collect();
    let target: Vec<_> = to.components().collect();
    let common = from
        .iter()
        .zip(target.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let mut parts: Vec<String> = vec!["..".to_string(); from.len() - common];
    parts.extend(
        target[common..]
            .iter()
            .map(|c| c.as_os_str().to_string_lossy().to_string()),
    );
    parts.join("/")
}

fn normalise_lexically(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
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

/// Replaces a `.stignore` AML wrote with the current one, and leaves any other alone.
///
/// The old ones lacked `(?d)`, so Syncthing would not delete a folder that still held a
/// `.DS_Store` — which on a Mac is every folder that has ever been opened in Finder. A folder
/// deleted on the PC then stuck at "95%, 4 items" here for ever. Replacing the file is safe
/// only when it is byte-for-byte one we wrote: a hand-edited one is the user's.
pub fn upgrade_stignore(root: &Path) -> Result<()> {
    let path = root.join(".stignore");
    let Ok(current) = fs::read_to_string(&path) else {
        return Ok(());
    };
    if crate::sidecar::syncthing::LEGACY_STIGNORE.contains(&current.as_str()) {
        write_atomic(&path, crate::sidecar::syncthing::STIGNORE.as_bytes())?;
        log::info!("updated .stignore in {}", root.display());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_folio() -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Test")).unwrap();
        (dir, folio)
    }

    /// The bug this guards: without `(?d)` Syncthing will not remove a directory that still
    /// holds an ignored file, and macOS puts a `.DS_Store` in every folder you open. A folder
    /// deleted on the other machine then stays in the sync queue for ever.
    #[test]
    fn every_ignore_pattern_may_be_deleted_with_its_folder() {
        let text = crate::sidecar::syncthing::STIGNORE;
        for line in text.lines() {
            if line.is_empty() {
                continue;
            }
            // Syncthing reads `//` as a comment and `#` as an ordinary pattern.
            assert!(
                !line.starts_with('#'),
                "`#` is not a comment in .stignore: {line}"
            );
            if line.starts_with("//") {
                continue;
            }
            assert!(line.starts_with("(?d)"), "pattern without (?d): {line}");
        }
        assert!(text.contains("(?d).DS_Store"));
    }

    #[test]
    fn opening_an_old_folio_replaces_the_stignore_we_wrote_and_nothing_else() {
        let (dir, _) = temp_folio();
        let path = dir.path().join(".stignore");

        for legacy in crate::sidecar::syncthing::LEGACY_STIGNORE {
            fs::write(&path, legacy).unwrap();
            Folio::open(dir.path()).unwrap();
            assert_eq!(
                fs::read_to_string(&path).unwrap(),
                crate::sidecar::syncthing::STIGNORE,
                "a .stignore AML wrote is replaced"
            );
        }

        // Anything the user has touched is theirs, however small the change.
        let mine = "// mine\nsecret/**\n";
        fs::write(&path, mine).unwrap();
        Folio::open(dir.path()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), mine);
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
    fn assets_are_stored_beside_the_top_level_folder() {
        let (_d, f) = temp_folio();
        f.create_folder("Thesis/chapters").unwrap();
        f.write_note("Thesis/chapters/03.md", "x", None).unwrap();
        let a = f
            .write_asset("Thesis/chapters/03.md", "My Photo (1).PNG", b"png")
            .unwrap();
        assert!(a.path.starts_with("Thesis/assets/"));
        assert!(a.path.ends_with("-my-photo-1-.png"), "{}", a.path);
        assert_eq!(
            a.markdown_path,
            format!("../assets/{}", a.path.rsplit('/').next().unwrap())
        );
        assert_eq!(fs::read(f.root().join(&a.path)).unwrap(), b"png");
        let root_asset = f.write_asset("Inbox.md", "cap.jpg", b"jpg").unwrap();
        assert!(root_asset.path.starts_with("assets/"));
        assert_eq!(root_asset.markdown_path, root_asset.path);
        let resolved = f
            .resolve_from_note("Thesis/chapters/03.md", &a.markdown_path)
            .unwrap();
        assert_eq!(resolved, f.root().join(&a.path));
        assert!(f.resolve_from_note("Inbox.md", "../../etc/passwd").is_err());
    }

    #[test]
    fn a_diagram_is_edited_in_place_rather_than_written_again() {
        let (_d, f) = temp_folio();
        f.create_folder("Thesis/chapters").unwrap();
        f.write_note("Thesis/chapters/03.md", "x", None).unwrap();
        let a = f
            .write_asset(
                "Thesis/chapters/03.md",
                "formulation.svg",
                b"<svg>one</svg>",
            )
            .unwrap();

        // The note references the file by a relative path; editing has to follow that path
        // back to the same bytes, or the drawing in the note and the one you edited differ.
        let text = f
            .read_asset_text("Thesis/chapters/03.md", &a.markdown_path)
            .unwrap();
        assert_eq!(text, "<svg>one</svg>");

        f.write_asset_text("Thesis/chapters/03.md", &a.markdown_path, "<svg>two</svg>")
            .unwrap();
        assert_eq!(
            f.read_asset_text("Thesis/chapters/03.md", &a.markdown_path)
                .unwrap(),
            "<svg>two</svg>"
        );
        // One file, still: an edit must not leave the old drawing orphaned in assets/.
        let count = fs::read_dir(f.root().join("Thesis/assets"))
            .unwrap()
            .count();
        assert_eq!(count, 1);
    }

    #[test]
    fn an_asset_path_cannot_walk_out_of_the_folio() {
        let (_d, f) = temp_folio();
        f.write_note("Inbox.md", "x", None).unwrap();
        assert!(f.read_asset_text("Inbox.md", "../../secrets.svg").is_err());
        assert!(f
            .write_asset_text("Inbox.md", "../../secrets.svg", "no")
            .is_err());
        assert!(f.read_asset_text("Inbox.md", "nothing-here.svg").is_err());
    }

    #[test]
    fn civil_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(10_957), (2000, 1, 1));
        assert_eq!(civil_from_days(20_705), (2026, 9, 9));
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
