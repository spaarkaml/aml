//! Sync conflicts (WP-4.2, ADR-005).
//!
//! When the same file changes on two machines before either has heard about the other,
//! Syncthing keeps the newer edit in place and sets the older one aside beside it as
//! `Name.sync-conflict-YYYYMMDD-HHMMSS-DEVICE.ext`. Nothing is lost — but until this module
//! nothing said so either, and those copies showed up in the Browser, in search and in the
//! graph as if they were notes of their own.
//!
//! This finds them, reads both sides, and resolves one. A resolution always writes the whole
//! chosen text atomically, and whatever it gives up goes to the Trash. It never deletes: with
//! no Snapshots yet (WP-4.1), the Trash is the only way back from a wrong choice.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::folio::{mtime_ms, write_atomic, Folio, FolioError, Result};

/// What a set-aside copy's file name says about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictName {
    /// The name of the file it is a copy of.
    pub original: String,
    /// When Syncthing set it aside, as `YYYY-MM-DD HH:MM:SS`.
    pub stamp: String,
    /// The first seven characters of the Device ID that wrote the set-aside version.
    pub device: String,
}

fn pattern() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Syncthing puts the marker before the last extension: `a.tar.gz` becomes
        // `a.tar.sync-conflict-…-DEVICE.gz`, and a name with no extension simply ends in the
        // device. The stem is lazy so the marker found is the first one.
        Regex::new(
            r"^(.+?)\.sync-conflict-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([A-Z0-9]{7})(\.[^.]+)?$",
        )
        .expect("the conflict pattern is valid")
    })
}

pub fn parse_name(name: &str) -> Option<ConflictName> {
    if !name.contains(".sync-conflict-") {
        return None;
    }
    let c = pattern().captures(name)?;
    let g = |i: usize| c.get(i).map_or("", |m| m.as_str());
    Some(ConflictName {
        original: format!("{}{}", g(1), g(9)),
        stamp: format!("{}-{}-{} {}:{}:{}", g(2), g(3), g(4), g(5), g(6), g(7)),
        device: g(8).to_string(),
    })
}

pub fn is_conflict_name(name: &str) -> bool {
    parse_name(name).is_some()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ConflictKind {
    /// A markdown note: compared paragraph by paragraph.
    Note,
    /// A Boundings, types, settings or manifest file: one item per line, so both sides can
    /// usually simply be kept.
    Settings,
    /// Anything else — an image, a diagram: one side or the other, whole.
    File,
}

fn kind_of(original: &str) -> ConflictKind {
    let lower = original.to_lowercase();
    if lower.ends_with(".md") {
        ConflictKind::Note
    } else if lower.ends_with(".yaml") || lower.ends_with(".yml") {
        ConflictKind::Settings
    } else {
        ConflictKind::File
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    /// Folio-relative path of the set-aside copy.
    pub path: String,
    /// Folio-relative path of the file it is a copy of.
    pub original: String,
    /// False when the original was deleted or renamed on the other machine.
    pub original_exists: bool,
    pub kind: ConflictKind,
    /// When the copy was set aside, `YYYY-MM-DD HH:MM:SS`.
    pub stamp: String,
    /// Short Device ID of the computer that wrote the set-aside version.
    pub device: String,
    #[specta(type = specta_typescript::Number)]
    pub mtime: u64,
    /// 0 when the original is missing.
    #[specta(type = specta_typescript::Number)]
    pub original_mtime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConflictPair {
    pub conflict: Conflict,
    /// `None` when that side is missing or is not text: the choice is then whole-file.
    pub original_text: Option<String>,
    pub copy_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "text", rename_all = "camelCase")]
pub enum Resolution {
    /// The edit in place stays; the set-aside copy goes to the Trash.
    KeepOriginal,
    /// The set-aside copy replaces the edit in place, which goes to the Trash.
    KeepCopy,
    /// This text replaces the edit in place; both old versions go to the Trash.
    Merge(String),
    /// Nothing is given up: the copy becomes an ordinary file beside the original.
    KeepBoth,
}

fn join_rel(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{prefix}/{name}")
    }
}

fn walk(dir: &Path, prefix: &str, out: &mut Vec<(String, ConflictName, u64)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let rel = join_rel(prefix, &name);
        if meta.is_dir() {
            // `.aml/` is walked because Boundings, types and settings are synced files that
            // can conflict like any other; every other hidden folder is someone else's.
            let hidden = name.starts_with('.') && !(prefix.is_empty() && name == ".aml");
            // Snapshots are written once under names unique to the second: they cannot
            // conflict, and there can be thousands of them.
            let snapshots = prefix == ".aml" && name == "snapshots";
            if !hidden && !snapshots && name != "node_modules" {
                walk(&entry.path(), &rel, out);
            }
        } else if !name.starts_with(".aml-tmp-") {
            if let Some(parsed) = parse_name(&name) {
                out.push((rel, parsed, mtime_ms(&meta)));
            }
        }
    }
}

/// The copy, its original, and the original's Folio-relative path.
///
/// Refuses anything that is not a conflict copy, so this module can only ever touch the two
/// files a conflict is made of — which is why it may reach into `.aml/` when nothing else may.
fn locate(root: &Path, rel: &str) -> Result<(PathBuf, PathBuf, String, ConflictName)> {
    let p = Path::new(rel);
    if rel.is_empty()
        || p.is_absolute()
        || p.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(FolioError::InvalidPath(rel.to_string()));
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let parsed = parse_name(&name).ok_or_else(|| FolioError::InvalidPath(rel.to_string()))?;
    let original_rel = match rel.rfind('/') {
        Some(i) => format!("{}/{}", &rel[..i], parsed.original),
        None => parsed.original.clone(),
    };
    Ok((root.join(p), root.join(&original_rel), original_rel, parsed))
}

fn read_text(path: &Path) -> Option<String> {
    let text = String::from_utf8(fs::read(path).ok()?).ok()?;
    Some(match text.strip_prefix('\u{feff}') {
        Some(rest) => rest.to_string(),
        None => text,
    })
}

fn split_name(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

fn describe(root: &Path, rel: &str, mtime: u64) -> Result<Conflict> {
    let (_, original, original_rel, parsed) = locate(root, rel)?;
    let meta = fs::metadata(&original).ok().filter(|m| m.is_file());
    Ok(Conflict {
        path: rel.to_string(),
        kind: kind_of(&original_rel),
        original_exists: meta.is_some(),
        original_mtime: meta.as_ref().map(mtime_ms).unwrap_or(0),
        original: original_rel,
        stamp: parsed.stamp,
        device: parsed.device,
        mtime,
    })
}

/// Everything a resolution gives up passes through here: the Trash in the app, a recorder in
/// the tests (a CI machine's Trash is not something a test should fill).
pub type Discard<'a> = &'a mut dyn FnMut(&Path) -> Result<()>;

fn to_trash(path: &Path) -> Result<()> {
    trash::delete(path).map_err(|e| FolioError::Io(e.to_string()))
}

impl Folio {
    /// Every set-aside copy in the Folio, newest first.
    pub fn conflicts(&self) -> Vec<Conflict> {
        let mut found = Vec::new();
        walk(self.root(), "", &mut found);
        let mut out: Vec<Conflict> = found
            .into_iter()
            .filter_map(|(rel, _, mtime)| describe(self.root(), &rel, mtime).ok())
            .collect();
        out.sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.path.cmp(&b.path)));
        out
    }

    pub fn read_conflict(&self, rel: &str) -> Result<ConflictPair> {
        let (copy, original, _, _) = locate(self.root(), rel)?;
        let meta = fs::metadata(&copy).map_err(|_| FolioError::NotFound(rel.to_string()))?;
        Ok(ConflictPair {
            conflict: describe(self.root(), rel, mtime_ms(&meta))?,
            original_text: read_text(&original),
            copy_text: read_text(&copy),
        })
    }

    pub fn resolve_conflict(
        &self,
        rel: &str,
        resolution: Resolution,
        expected_original_mtime: Option<u64>,
    ) -> Result<()> {
        self.resolve_conflict_with(rel, resolution, expected_original_mtime, &mut to_trash)
    }

    pub(crate) fn resolve_conflict_with(
        &self,
        rel: &str,
        resolution: Resolution,
        expected_original_mtime: Option<u64>,
        discard: Discard,
    ) -> Result<()> {
        let (copy, original, original_rel, parsed) = locate(self.root(), rel)?;
        if !copy.is_file() {
            return Err(FolioError::NotFound(rel.to_string()));
        }
        // The original moved again while you were deciding: that is a new decision to make
        // with the new text in front of you, not this one applied to text you never saw.
        if let (Some(expected), Ok(meta)) = (expected_original_mtime, fs::metadata(&original)) {
            let disk = mtime_ms(&meta);
            if disk != expected {
                return Err(FolioError::Conflict { disk_mtime: disk });
            }
        }
        let replaces = matches!(resolution, Resolution::KeepCopy | Resolution::Merge(_));
        if replaces && parsed.original.to_lowercase().ends_with(".md") {
            // Besides the Trash: a Snapshot is where you would look for the note's history.
            if let Err(e) = crate::snapshots::keep_before(
                self.root(),
                &original_rel,
                crate::snapshots::BEFORE_CONFLICT,
            ) {
                log::warn!("could not take a snapshot of {original_rel}: {e}");
            }
        }
        match resolution {
            Resolution::KeepOriginal => discard(&copy),
            Resolution::KeepCopy => {
                let bytes = fs::read(&copy)?;
                replace(&original, &bytes, discard)?;
                discard(&copy)
            }
            Resolution::Merge(text) => {
                replace(&original, text.as_bytes(), discard)?;
                discard(&copy)
            }
            Resolution::KeepBoth => {
                if original_rel.starts_with(".aml/") {
                    // Two Boundings files is not two sets of Boundings: only one is ever read.
                    return Err(FolioError::InvalidPath(format!(
                        "{original_rel} cannot be kept twice; choose one side or combine them"
                    )));
                }
                let target = unique_sibling(&original, &parsed);
                fs::rename(&copy, &target)?;
                Ok(())
            }
        }
    }
}

/// Writes `bytes` over `original`, first sending the version being replaced to the Trash
/// under a name that says what it was.
fn replace(original: &Path, bytes: &[u8], discard: Discard) -> Result<()> {
    if let Some(parent) = original.parent() {
        fs::create_dir_all(parent)?;
    }
    if !original.is_file() {
        return write_atomic(original, bytes);
    }
    let name = original
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let (stem, ext) = split_name(&name);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("aml-resolved-{nanos}"));
    fs::create_dir_all(&dir)?;
    let backup = dir.join(format!("{stem} (before resolving a conflict){ext}"));
    fs::copy(original, &backup)?;
    write_atomic(original, bytes)?;
    let result = discard(&backup);
    let _ = fs::remove_dir(&dir);
    result
}

/// `Note (copy from 2026-09-13).md`, numbered if that is taken.
fn unique_sibling(original: &Path, parsed: &ConflictName) -> PathBuf {
    let dir = original.parent().map(Path::to_path_buf).unwrap_or_default();
    let (stem, ext) = split_name(&parsed.original);
    let day = parsed.stamp.get(..10).unwrap_or(&parsed.stamp);
    let first = dir.join(format!("{stem} (copy from {day}){ext}"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{stem} (copy from {day}) {n}{ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

#[cfg(test)]
mod tests {
    use super::*;

    const COPY: &str = "Thesis/03 Influence.sync-conflict-20260913-101112-ABC2DEF.md";

    fn temp_folio() -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Test")).unwrap();
        (dir, folio)
    }

    fn put(f: &Folio, rel: &str, text: &str) {
        let abs = f.root().join(rel);
        fs::create_dir_all(abs.parent().unwrap()).unwrap();
        fs::write(abs, text).unwrap();
    }

    /// Runs a resolution with a recorder instead of the Trash, and returns what was given up.
    fn resolve(f: &Folio, rel: &str, r: Resolution, expected: Option<u64>) -> Result<Vec<String>> {
        let mut gone = Vec::new();
        {
            let mut record = |p: &Path| -> Result<()> {
                gone.push(fs::read_to_string(p)?);
                fs::remove_file(p)?;
                Ok(())
            };
            f.resolve_conflict_with(rel, r, expected, &mut record)?;
        }
        Ok(gone)
    }

    #[test]
    fn reads_what_syncthing_writes_into_a_name() {
        let n = parse_name("03 Influence.sync-conflict-20260913-101112-ABC2DEF.md").unwrap();
        assert_eq!(n.original, "03 Influence.md");
        assert_eq!(n.stamp, "2026-09-13 10:11:12");
        assert_eq!(n.device, "ABC2DEF");
        // The marker goes before the last extension, and a name may have none at all.
        assert_eq!(
            parse_name("a.tar.sync-conflict-20260913-101112-ABC2DEF.gz")
                .unwrap()
                .original,
            "a.tar.gz"
        );
        assert_eq!(
            parse_name("Makefile.sync-conflict-20260913-101112-ABC2DEF")
                .unwrap()
                .original,
            "Makefile"
        );
        // A note that merely talks about conflicts is not one.
        assert!(parse_name("my.sync-conflict-notes.md").is_none());
        assert!(parse_name("Influence.md").is_none());
    }

    #[test]
    fn finds_copies_everywhere_they_can_be_including_aml() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(&f, COPY, "set aside\n");
        put(
            &f,
            ".aml/boundings.sync-conflict-20260912-080000-ZZZ9ZZZ.yaml",
            "- id: a\n",
        );
        put(
            &f,
            "Gone.sync-conflict-20260911-080000-ZZZ9ZZZ.md",
            "orphan\n",
        );
        put(
            &f,
            ".git/x.sync-conflict-20260911-080000-ZZZ9ZZZ.md",
            "not ours\n",
        );

        let list = f.conflicts();
        let paths: Vec<&str> = list.iter().map(|c| c.path.as_str()).collect();
        assert_eq!(list.len(), 3, "{paths:?}");
        let note = list.iter().find(|c| c.path == COPY).unwrap();
        assert_eq!(note.original, "Thesis/03 Influence.md");
        assert_eq!(note.kind, ConflictKind::Note);
        assert!(note.original_exists);
        let settings = list
            .iter()
            .find(|c| c.original == ".aml/boundings.yaml")
            .unwrap();
        assert_eq!(settings.kind, ConflictKind::Settings);
        // The original was deleted on the other machine; the copy is still worth showing.
        assert!(
            !list
                .iter()
                .find(|c| c.original == "Gone.md")
                .unwrap()
                .original_exists
        );
    }

    #[test]
    fn a_copy_is_not_a_note_in_the_browser_or_the_count() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(&f, COPY, "set aside\n");
        let names: Vec<String> = f.tree().unwrap()[0]
            .children
            .iter()
            .map(|n| n.name.clone())
            .collect();
        assert_eq!(names, vec!["03 Influence.md"]);
        assert_eq!(f.info().note_count, 1);
    }

    #[test]
    fn both_sides_are_read_and_a_binary_side_is_not_pretended_to_be_text() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "\u{feff}in place\n");
        put(&f, COPY, "set aside\n");
        let pair = f.read_conflict(COPY).unwrap();
        assert_eq!(pair.original_text.as_deref(), Some("in place\n"));
        assert_eq!(pair.copy_text.as_deref(), Some("set aside\n"));

        let pic = "a.sync-conflict-20260913-101112-ABC2DEF.png";
        fs::write(f.root().join(pic), [0xff, 0xd8, 0xff, 0x00]).unwrap();
        assert!(f.read_conflict(pic).unwrap().copy_text.is_none());
    }

    #[test]
    fn keeping_the_original_gives_up_only_the_copy() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(&f, COPY, "set aside\n");
        let gone = resolve(&f, COPY, Resolution::KeepOriginal, None).unwrap();
        assert_eq!(gone, vec!["set aside\n"]);
        assert_eq!(
            fs::read_to_string(f.root().join("Thesis/03 Influence.md")).unwrap(),
            "in place\n"
        );
        assert!(f.conflicts().is_empty());
    }

    #[test]
    fn a_merge_writes_the_merge_and_both_old_versions_go_to_the_trash() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(&f, COPY, "set aside\n");
        let gone = resolve(&f, COPY, Resolution::Merge("both, combined\n".into()), None).unwrap();
        assert_eq!(
            fs::read_to_string(f.root().join("Thesis/03 Influence.md")).unwrap(),
            "both, combined\n"
        );
        // Nothing is lost: what was in place and what was set aside are both recoverable.
        assert_eq!(gone, vec!["in place\n", "set aside\n"]);
        assert!(f.conflicts().is_empty());
        // And a Snapshot, which is where you would look for the note's history (WP-4.1).
        let kept = f.snapshots("Thesis/03 Influence.md").unwrap();
        let before = kept
            .iter()
            .find(|s| s.label.as_deref() == Some(crate::snapshots::BEFORE_CONFLICT))
            .expect("the replaced text is a snapshot");
        assert_eq!(
            f.read_snapshot("Thesis/03 Influence.md", &before.id)
                .unwrap(),
            "in place\n"
        );
        assert!(f.conflicts().is_empty(), "snapshots are never conflicts");
    }

    #[test]
    fn keeping_the_copy_replaces_the_original_with_it() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(&f, COPY, "set aside\n");
        resolve(&f, COPY, Resolution::KeepCopy, None).unwrap();
        assert_eq!(
            fs::read_to_string(f.root().join("Thesis/03 Influence.md")).unwrap(),
            "set aside\n"
        );
    }

    #[test]
    fn a_resolution_is_refused_when_the_original_changed_while_you_decided() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(&f, COPY, "set aside\n");
        let seen = f.read_conflict(COPY).unwrap().conflict.original_mtime;
        let refused = resolve(&f, COPY, Resolution::Merge("x".into()), Some(seen + 1));
        assert!(matches!(refused, Err(FolioError::Conflict { .. })));
        // Refused means untouched: both files are exactly as they were.
        assert_eq!(f.conflicts().len(), 1);
        assert_eq!(
            fs::read_to_string(f.root().join("Thesis/03 Influence.md")).unwrap(),
            "in place\n"
        );
        assert!(resolve(&f, COPY, Resolution::Merge("x".into()), Some(seen)).is_ok());
    }

    #[test]
    fn keeping_both_makes_the_copy_an_ordinary_file_and_never_overwrites_one() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        put(
            &f,
            "Thesis/03 Influence (copy from 2026-09-13).md",
            "already here\n",
        );
        put(&f, COPY, "set aside\n");
        let gone = resolve(&f, COPY, Resolution::KeepBoth, None).unwrap();
        assert!(gone.is_empty());
        assert_eq!(
            fs::read_to_string(
                f.root()
                    .join("Thesis/03 Influence (copy from 2026-09-13) 2.md")
            )
            .unwrap(),
            "set aside\n"
        );
        assert!(f.conflicts().is_empty());
    }

    #[test]
    fn a_settings_file_cannot_be_kept_twice() {
        let (_d, f) = temp_folio();
        let copy = ".aml/boundings.sync-conflict-20260912-080000-ZZZ9ZZZ.yaml";
        put(&f, ".aml/boundings.yaml", "- id: a\n");
        put(&f, copy, "- id: b\n");
        assert!(resolve(&f, copy, Resolution::KeepBoth, None).is_err());
        resolve(
            &f,
            copy,
            Resolution::Merge("- id: a\n- id: b\n".into()),
            None,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(f.root().join(".aml/boundings.yaml")).unwrap(),
            "- id: a\n- id: b\n"
        );
    }

    #[test]
    fn only_a_conflict_copy_can_be_resolved() {
        let (_d, f) = temp_folio();
        put(&f, "Thesis/03 Influence.md", "in place\n");
        for bad in [
            "Thesis/03 Influence.md",
            "../elsewhere.sync-conflict-20260913-101112-ABC2DEF.md",
            "/etc/x.sync-conflict-20260913-101112-ABC2DEF.md",
            "",
        ] {
            assert!(
                resolve(&f, bad, Resolution::KeepOriginal, None).is_err(),
                "{bad}"
            );
        }
        assert!(f.root().join("Thesis/03 Influence.md").exists());
    }
}
