//! Snapshots (ADR-006, WP-4.1): full copies of a note at a point in time, kept inside the
//! Folio so they follow it to the other machine.
//!
//! A note's Snapshots live at `.aml/snapshots/<note path>/<YYYYMMDD-HHMMSS>[-label].md`. The
//! stamp is UTC, so the two machines agree about the order and about which day a Snapshot
//! belongs to whatever time zone either is in. Each file is written once and never edited, and
//! its name is unique to the second, so two machines never write the same file and Snapshots
//! cannot themselves conflict.
//!
//! **When one is taken.** Not by a timer. Before a note is written, if this run of AML has not
//! looked at that note in the last 30 minutes, the text *on disk* — the version about to be
//! replaced — is kept, unless it is already the newest Snapshot. So the first save of a sitting
//! keeps the note as it was before you started, and a long sitting keeps one every half hour.
//! A note nobody is changing gets none, and a machine that has only received changes by sync
//! never duplicates the Snapshots the other one took. The same rule runs before every other
//! write AML makes to a note (a rename's link updates, a Corkboard synopsis), and a labelled one
//! is kept before a restore and before a conflict is resolved over a note.
//!
//! **Retention** runs when a Folio opens: everything for 7 days, then the newest of each day
//! for 90, then only labelled ones — and always a note's newest, so a note untouched for a
//! season still has one. Both machines prune by the same rule from the same names, so they
//! agree about what goes.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::folio::{civil_from_days, write_atomic, Folio, FolioError, NoteMeta, Result};

/// Where Snapshots live, relative to the Folio root.
pub const SNAPSHOT_DIR: [&str; 2] = [".aml", "snapshots"];
/// How long a sitting runs before the next automatic Snapshot.
pub const AUTO_EVERY_MS: u64 = 30 * 60 * 1000;
pub const DEFAULT_KEEP_ALL_DAYS: u32 = 7;
pub const DEFAULT_KEEP_DAILY_DAYS: u32 = 90;
const LABEL_MAX: usize = 60;
pub const BEFORE_RESTORE: &str = "Before restoring";
pub const BEFORE_CONFLICT: &str = "Before resolving a conflict";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// The file name, which is also how the UI asks for it back.
    pub id: String,
    /// When it was taken, `2026-09-14T10:11:12Z`.
    pub taken: String,
    pub label: Option<String>,
    pub words: u32,
    #[specta(type = specta_typescript::Number)]
    pub size: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotUsage {
    pub count: u32,
    #[specta(type = specta_typescript::Number)]
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Retention {
    /// Every Snapshot younger than this is kept.
    pub keep_all_days: u32,
    /// Past `keep_all_days` and younger than this, the newest of each day is kept.
    pub keep_daily_days: u32,
}

impl Default for Retention {
    fn default() -> Self {
        Self {
            keep_all_days: DEFAULT_KEEP_ALL_DAYS,
            keep_daily_days: DEFAULT_KEEP_DAILY_DAYS,
        }
    }
}

/* ---------------- names ---------------- */

/// A Snapshot's name, read back: when (seconds since the epoch, UTC) and its label.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotName {
    pub secs: u64,
    pub label: Option<String>,
}

/// Howard Hinnant's inverse: (year, month, day) → days since 1970-01-01.
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if m > 2 { m - 3 } else { m + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + d as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

fn stamp(secs: u64) -> String {
    let (y, m, d) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn iso(secs: u64) -> String {
    let (y, m, d) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

pub fn file_name(secs: u64, label: Option<&str>) -> String {
    match label {
        Some(l) => format!("{}-{l}.md", stamp(secs)),
        None => format!("{}.md", stamp(secs)),
    }
}

/// `20260914-101112.md` or `20260914-101112-Sent to editor.md`; anything else is not ours.
pub fn parse_name(name: &str) -> Option<SnapshotName> {
    let body = name.strip_suffix(".md")?;
    let bytes = body.as_bytes();
    if bytes.len() < 15 || bytes[8] != b'-' {
        return None;
    }
    let digits = |r: std::ops::Range<usize>| -> Option<u64> {
        let s = body.get(r)?;
        s.bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| s.parse().ok())?
    };
    let (y, mo, d) = (digits(0..4)?, digits(4..6)?, digits(6..8)?);
    let (h, mi, s) = (digits(9..11)?, digits(11..13)?, digits(13..15)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 59 {
        return None;
    }
    let label = match body.get(15..) {
        Some("") => None,
        Some(rest) => Some(rest.strip_prefix('-')?.to_string()).filter(|l| !l.is_empty()),
        None => None,
    };
    if body.len() > 15 && label.is_none() {
        return None;
    }
    let days = days_from_civil(y as i64, mo as u32, d as u32);
    if days < 0 {
        return None;
    }
    Some(SnapshotName {
        secs: days as u64 * 86_400 + h * 3600 + mi * 60 + s,
        label,
    })
}

/// A label as it can live in a file name on both macOS and Windows: no separators, nothing
/// Windows refuses, one space between words, no trailing dot, and not too long.
pub fn clean_label(raw: &str) -> Option<String> {
    let kept: String = raw
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let words: Vec<&str> = kept.split_whitespace().collect();
    let mut label: String = words.join(" ").chars().take(LABEL_MAX).collect();
    while label.ends_with('.') || label.ends_with(' ') {
        label.pop();
    }
    (!label.is_empty()).then_some(label)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Words in a note's body, front matter left out. Only a guide to tell versions apart.
pub fn word_count(text: &str) -> u32 {
    let body = text
        .strip_prefix("---\n")
        .and_then(|rest| rest.find("\n---").map(|end| &rest[end + 4..]))
        .unwrap_or(text);
    body.split_whitespace()
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .count() as u32
}

/* ---------------- where ---------------- */

pub fn root_dir(root: &Path) -> PathBuf {
    SNAPSHOT_DIR
        .iter()
        .fold(root.to_path_buf(), |p, s| p.join(s))
}

/// The folder holding one note's Snapshots. Refuses anything that is not a note inside the
/// Folio proper: no `..`, no absolute path, nothing in `.aml/`.
fn dir_for(root: &Path, rel: &str) -> Result<PathBuf> {
    let invalid = || FolioError::InvalidPath(rel.to_string());
    if !rel.to_lowercase().ends_with(".md") || rel.starts_with('/') || rel.starts_with('\\') {
        return Err(invalid());
    }
    let mut dir = root_dir(root);
    for (i, seg) in rel.split('/').enumerate() {
        if seg.is_empty() || seg == "." || seg == ".." || seg.contains('\\') || seg.contains(':') {
            return Err(invalid());
        }
        if i == 0 && seg == ".aml" {
            return Err(invalid());
        }
        dir.push(seg);
    }
    Ok(dir)
}

fn note_path(root: &Path, rel: &str) -> PathBuf {
    rel.split('/').fold(root.to_path_buf(), |p, s| p.join(s))
}

/// A note's Snapshots as (name, parsed), newest first.
fn entries(dir: &Path) -> Vec<(String, SnapshotName)> {
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<(String, SnapshotName)> = read
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            parse_name(&name).map(|p| (name, p))
        })
        .collect();
    out.sort_by(|a, b| b.1.secs.cmp(&a.1.secs).then_with(|| b.0.cmp(&a.0)));
    out
}

/* ---------------- taking ---------------- */

/// Writes `bytes` as a Snapshot of the note at `dir`, at `secs` or the first free second after.
fn write_snapshot(dir: &Path, bytes: &[u8], secs: u64, label: Option<&str>) -> Result<String> {
    fs::create_dir_all(dir)?;
    for offset in 0..60 {
        let name = file_name(secs + offset, label);
        let path = dir.join(&name);
        if path.exists() {
            if fs::read(&path).is_ok_and(|b| b == bytes) {
                return Ok(name);
            }
            continue;
        }
        write_atomic(&path, bytes)?;
        return Ok(name);
    }
    Err(FolioError::AlreadyExists(dir.display().to_string()))
}

fn describe(dir: &Path, name: &str) -> Option<Snapshot> {
    let parsed = parse_name(name)?;
    let path = dir.join(name);
    let bytes = fs::read(&path).ok()?;
    Some(Snapshot {
        id: name.to_string(),
        taken: iso(parsed.secs),
        label: parsed.label,
        words: word_count(&String::from_utf8_lossy(&bytes)),
        size: bytes.len() as u64,
    })
}

/// When each note was last looked at by the automatic rule in this run of AML, by its path on
/// disk. Kept in memory on purpose: a restart is a new sitting.
#[derive(Default)]
pub struct Sittings(Mutex<HashMap<PathBuf, u64>>);

fn sittings() -> &'static Sittings {
    static SITTINGS: OnceLock<Sittings> = OnceLock::new();
    SITTINGS.get_or_init(Sittings::default)
}

/// The automatic rule, before `rel` is written: keep what is on disk if this sitting has not
/// done so in the last 30 minutes and it is not already the newest Snapshot. Returns the name
/// of the Snapshot taken, if one was.
pub fn before_write_with(
    root: &Path,
    rel: &str,
    now_ms: u64,
    sittings: &Sittings,
) -> Result<Option<String>> {
    let Ok(dir) = dir_for(root, rel) else {
        return Ok(None);
    };
    let note = note_path(root, rel);
    if !note.is_file() {
        return Ok(None);
    }
    {
        let mut seen = sittings
            .0
            .lock()
            .map_err(|e| FolioError::Io(e.to_string()))?;
        if seen
            .get(&note)
            .is_some_and(|t| now_ms.saturating_sub(*t) < AUTO_EVERY_MS)
        {
            return Ok(None);
        }
        seen.insert(note.clone(), now_ms);
    }
    let bytes = fs::read(&note)?;
    if String::from_utf8_lossy(&bytes).trim().is_empty() {
        return Ok(None);
    }
    if let Some((newest, _)) = entries(&dir).first() {
        if fs::read(dir.join(newest)).is_ok_and(|b| b == bytes) {
            return Ok(None);
        }
    }
    write_snapshot(&dir, &bytes, now_ms / 1000, None).map(Some)
}

/// [`before_write_with`] on this run's sittings and clock. A Snapshot that cannot be taken is
/// logged and never stops the write it was protecting: failing to save the writing because a
/// copy of it could not be made would be the wrong way round.
pub fn before_write(root: &Path, rel: &str) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    if let Err(e) = before_write_with(root, rel, now_ms, sittings()) {
        log::warn!("could not take a snapshot of {rel}: {e}");
    }
}

/// Keeps what is on disk under `label`, unless it is exactly the newest Snapshot already.
/// For the moments just before AML itself replaces a note's text.
pub fn keep_before(root: &Path, rel: &str, label: &str) -> Result<Option<String>> {
    let dir = dir_for(root, rel)?;
    let note = note_path(root, rel);
    let Ok(bytes) = fs::read(&note) else {
        return Ok(None);
    };
    if let Some((newest, _)) = entries(&dir).first() {
        if fs::read(dir.join(newest)).is_ok_and(|b| b == bytes) {
            return Ok(None);
        }
    }
    write_snapshot(&dir, &bytes, now_secs(), clean_label(label).as_deref()).map(Some)
}

/* ---------------- moving with the note ---------------- */

fn merge_into(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.flatten() {
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            merge_into(&from, &to)?;
        } else if !to.exists() {
            fs::rename(&from, &to)?;
        }
    }
    let _ = fs::remove_dir(src);
    Ok(())
}

/// A note or folder moved from `from` to `to`: its history goes with it. Works for folders
/// too, because the Snapshot tree mirrors the note tree.
pub fn move_history(root: &Path, from: &str, to: &str) -> std::io::Result<()> {
    let base = root_dir(root);
    let src = from.split('/').fold(base.clone(), |p, s| p.join(s));
    let dst = to.split('/').fold(base, |p, s| p.join(s));
    if !src.is_dir() || src == dst {
        return Ok(());
    }
    let case_only = src.to_string_lossy().to_lowercase() == dst.to_string_lossy().to_lowercase();
    if !dst.exists() || case_only {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        return fs::rename(&src, &dst);
    }
    merge_into(&src, &dst)
}

/* ---------------- retention ---------------- */

/// Which of one note's Snapshots retention removes. `list` may be in any order.
pub fn to_prune(list: &[(String, SnapshotName)], now: u64, keep: Retention) -> Vec<String> {
    let newest = list
        .iter()
        .max_by(|a, b| a.1.secs.cmp(&b.1.secs).then_with(|| a.0.cmp(&b.0)))
        .map(|(n, _)| n.clone());
    let all_until = u64::from(keep.keep_all_days) * 86_400;
    let daily_until = u64::from(keep.keep_daily_days.max(keep.keep_all_days)) * 86_400;
    // The newest of each day, among those old enough that only one a day is kept.
    let mut day_best: HashMap<u64, (u64, &str)> = HashMap::new();
    for (name, p) in list {
        let age = now.saturating_sub(p.secs);
        if p.label.is_none() && age > all_until && age <= daily_until {
            let best = day_best
                .entry(p.secs / 86_400)
                .or_insert((p.secs, name.as_str()));
            if (p.secs, name.as_str()) > *best {
                *best = (p.secs, name);
            }
        }
    }
    list.iter()
        .filter(|(name, p)| {
            if p.label.is_some() || Some(name) == newest.as_ref() {
                return false;
            }
            let age = now.saturating_sub(p.secs);
            if age <= all_until {
                false
            } else if age <= daily_until {
                day_best
                    .get(&(p.secs / 86_400))
                    .is_none_or(|(_, n)| *n != name.as_str())
            } else {
                true
            }
        })
        .map(|(n, _)| n.clone())
        .collect()
}

/// Every folder under `.aml/snapshots/` that holds Snapshots, deepest first.
fn snapshot_dirs(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            snapshot_dirs(&entry.path(), out);
        }
    }
    out.push(dir.to_path_buf());
}

pub fn prune(root: &Path, now: u64, keep: Retention) -> Result<u32> {
    let mut dirs = Vec::new();
    snapshot_dirs(&root_dir(root), &mut dirs);
    let mut removed = 0;
    let base = root_dir(root);
    for dir in dirs {
        for name in to_prune(&entries(&dir), now, keep) {
            if fs::remove_file(dir.join(&name)).is_ok() {
                removed += 1;
            }
        }
        // A note's folder emptied by retention goes too; the top folder always stays.
        if dir != base {
            let _ = fs::remove_dir(&dir);
        }
    }
    Ok(removed)
}

pub fn usage(root: &Path) -> SnapshotUsage {
    let mut dirs = Vec::new();
    snapshot_dirs(&root_dir(root), &mut dirs);
    let mut out = SnapshotUsage::default();
    for dir in dirs {
        for (name, _) in entries(&dir) {
            if let Ok(meta) = fs::metadata(dir.join(name)) {
                out.count += 1;
                out.bytes += meta.len();
            }
        }
    }
    out
}

/* ---------------- the Folio ---------------- */

impl Folio {
    /// A note's Snapshots, newest first.
    pub fn snapshots(&self, rel: &str) -> Result<Vec<Snapshot>> {
        let dir = dir_for(self.root(), rel)?;
        Ok(entries(&dir)
            .iter()
            .filter_map(|(name, _)| describe(&dir, name))
            .collect())
    }

    pub fn read_snapshot(&self, rel: &str, id: &str) -> Result<String> {
        let path = self.snapshot_path(rel, id)?;
        let bytes = fs::read(&path).map_err(|_| FolioError::NotFound(id.to_string()))?;
        String::from_utf8(bytes).map_err(|_| FolioError::NotText(id.to_string()))
    }

    fn snapshot_path(&self, rel: &str, id: &str) -> Result<PathBuf> {
        if parse_name(id).is_none() || id.contains('/') || id.contains('\\') {
            return Err(FolioError::InvalidPath(id.to_string()));
        }
        Ok(dir_for(self.root(), rel)?.join(id))
    }

    /// "Take Snapshot": the note as it is on disk now, with an optional label.
    pub fn take_snapshot(&self, rel: &str, label: Option<&str>) -> Result<Snapshot> {
        let dir = dir_for(self.root(), rel)?;
        let bytes = fs::read(note_path(self.root(), rel))
            .map_err(|_| FolioError::NotFound(rel.to_string()))?;
        let label = label.and_then(clean_label);
        let name = write_snapshot(&dir, &bytes, now_secs(), label.as_deref())?;
        describe(&dir, &name).ok_or(FolioError::NotFound(name))
    }

    /// Puts a Snapshot's exact bytes back as the note, keeping the text it replaces as a
    /// labelled Snapshot first — so a restore is itself one step you can take back.
    pub fn restore_snapshot(&self, rel: &str, id: &str) -> Result<NoteMeta> {
        let from = self.snapshot_path(rel, id)?;
        let bytes = fs::read(&from).map_err(|_| FolioError::NotFound(id.to_string()))?;
        let note = self.resolve(rel)?;
        if fs::read(&note).ok().as_deref() != Some(bytes.as_slice()) {
            keep_before(self.root(), rel, BEFORE_RESTORE)?;
            write_atomic(&note, &bytes)?;
        }
        let meta = fs::metadata(&note)?;
        Ok(NoteMeta {
            path: rel.to_string(),
            mtime: crate::folio::mtime_ms(&meta),
            size: meta.len(),
        })
    }

    pub fn snapshot_usage(&self) -> SnapshotUsage {
        usage(self.root())
    }

    /// Retention, by the Folio's own settings.
    pub fn prune_snapshots(&self) -> Result<u32> {
        let settings = self.settings()?;
        let keep = crate::config::retention_of(&settings);
        prune(self.root(), now_secs(), keep)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: u64 = 86_400;

    fn temp_folio() -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Test")).unwrap();
        (dir, folio)
    }

    fn named(secs: u64, label: Option<&str>) -> (String, SnapshotName) {
        let name = file_name(secs, label);
        let parsed = parse_name(&name).unwrap();
        (name, parsed)
    }

    #[test]
    fn names_round_trip_in_utc_and_refuse_lookalikes() {
        // 2026-09-14 10:11:12 UTC
        let secs = days_from_civil(2026, 9, 14) as u64 * DAY + 10 * 3600 + 11 * 60 + 12;
        assert_eq!(file_name(secs, None), "20260914-101112.md");
        assert_eq!(iso(secs), "2026-09-14T10:11:12Z");
        let labelled = file_name(secs, Some("Sent to editor - v2"));
        assert_eq!(labelled, "20260914-101112-Sent to editor - v2.md");
        assert_eq!(
            parse_name(&labelled),
            Some(SnapshotName {
                secs,
                label: Some("Sent to editor - v2".into())
            })
        );
        assert_eq!(parse_name("20260914-101112.md").unwrap().secs, secs);
        for bad in [
            "notes.md",
            "20260914-101112.txt",
            "20261314-101112.md",
            "20260914-251112.md",
            "20260914-101112x.md",
            "20260914-101112-.md",
            "2026091-101112.md",
        ] {
            assert_eq!(parse_name(bad), None, "{bad}");
        }
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(civil_from_days(days_from_civil(2024, 2, 29)), (2024, 2, 29));
    }

    #[test]
    fn a_label_is_made_safe_for_either_file_system() {
        assert_eq!(
            clean_label("  Draft: to   Anna/Bob?  "),
            Some("Draft to Anna Bob".into())
        );
        assert_eq!(clean_label("end..."), Some("end".into()));
        assert_eq!(clean_label(" \t "), None);
        assert_eq!(clean_label(&"x".repeat(200)).unwrap().len(), LABEL_MAX);
    }

    #[test]
    fn the_first_save_of_a_sitting_keeps_the_note_as_it_was_and_then_every_half_hour() {
        let (_d, folio) = temp_folio();
        let root = folio.root();
        folio.write_note("a.md", "before", None).unwrap();
        let sit = Sittings::default();
        let t0 = 1_800_000_000_000;

        // First write of the sitting: the text on disk is kept.
        let first = before_write_with(root, "a.md", t0, &sit).unwrap();
        assert!(first.is_some());
        fs::write(root.join("a.md"), "during").unwrap();
        // Ten minutes on, still the same sitting: nothing.
        assert_eq!(
            before_write_with(root, "a.md", t0 + 10 * 60_000, &sit).unwrap(),
            None
        );
        // Half an hour on: what is on disk now is kept.
        assert!(before_write_with(root, "a.md", t0 + AUTO_EVERY_MS, &sit)
            .unwrap()
            .is_some());
        let list = folio.snapshots("a.md").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(folio.read_snapshot("a.md", &list[0].id).unwrap(), "during");
        assert_eq!(folio.read_snapshot("a.md", &list[1].id).unwrap(), "before");

        // A new sitting over text that is already the newest Snapshot keeps nothing twice.
        let fresh = Sittings::default();
        assert_eq!(
            before_write_with(root, "a.md", t0 + 2 * AUTO_EVERY_MS, &fresh).unwrap(),
            None
        );
    }

    #[test]
    fn nothing_is_kept_for_a_new_or_empty_note_or_anything_outside_the_notes() {
        let (_d, folio) = temp_folio();
        let root = folio.root();
        let sit = Sittings::default();
        assert_eq!(before_write_with(root, "new.md", 0, &sit).unwrap(), None);
        folio.write_note("empty.md", "  \n", None).unwrap();
        assert_eq!(before_write_with(root, "empty.md", 0, &sit).unwrap(), None);
        assert_eq!(
            before_write_with(root, ".aml/boundings.yaml", 0, &sit).unwrap(),
            None
        );
        assert!(folio.snapshots("../escape.md").is_err());
        assert!(folio.snapshots(".aml/x.md").is_err());
        assert_eq!(usage(root).count, 0);
    }

    #[test]
    fn saving_a_note_through_the_folio_takes_the_automatic_snapshot() {
        let (_d, folio) = temp_folio();
        fs::write(folio.root().join("b.md"), "the original").unwrap();
        folio.write_note("b.md", "rewritten", None).unwrap();
        let list = folio.snapshots("b.md").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(
            folio.read_snapshot("b.md", &list[0].id).unwrap(),
            "the original"
        );
        assert!(folio.root().join(".aml/snapshots/b.md").is_dir());
    }

    #[test]
    fn restore_is_byte_identical_and_keeps_what_it_replaced() {
        let (_d, folio) = temp_folio();
        let original = "---\ntitle: x\n---\r\n\nFirst\u{a0}draft.\n";
        fs::write(folio.root().join("c.md"), original).unwrap();
        let taken = folio.take_snapshot("c.md", Some("Draft one")).unwrap();
        assert_eq!(taken.label.as_deref(), Some("Draft one"));
        assert_eq!(taken.words, 2);
        fs::write(folio.root().join("c.md"), "Second draft.").unwrap();

        folio.restore_snapshot("c.md", &taken.id).unwrap();
        assert_eq!(
            fs::read(folio.root().join("c.md")).unwrap(),
            original.as_bytes()
        );
        let list = folio.snapshots("c.md").unwrap();
        let before = list
            .iter()
            .find(|s| s.label.as_deref() == Some(BEFORE_RESTORE))
            .expect("the replaced text is kept");
        assert_eq!(
            folio.read_snapshot("c.md", &before.id).unwrap(),
            "Second draft."
        );

        // Restoring what is already there writes nothing and keeps nothing.
        let count = list.len();
        folio.restore_snapshot("c.md", &taken.id).unwrap();
        assert_eq!(folio.snapshots("c.md").unwrap().len(), count);
        assert!(folio.read_snapshot("c.md", "../../c.md").is_err());
    }

    #[test]
    fn two_snapshots_in_one_second_do_not_overwrite_each_other() {
        let dir = tempfile::tempdir().unwrap();
        let a = write_snapshot(dir.path(), b"one", 100, None).unwrap();
        let b = write_snapshot(dir.path(), b"two", 100, None).unwrap();
        let again = write_snapshot(dir.path(), b"one", 100, None).unwrap();
        assert_ne!(a, b);
        assert_eq!(again, a);
    }

    #[test]
    fn retention_keeps_a_week_then_one_a_day_then_labels_and_the_newest() {
        let now = 400 * DAY;
        let list = vec![
            named(now - 3600, None),                 // today: kept
            named(now - 2 * DAY, None),              // this week: kept
            named(now - 2 * DAY - 60, None),         // this week: kept
            named(now - 20 * DAY + 100, None),       // older, not newest that day
            named(now - 20 * DAY + 200, None),       // older, newest that day: kept
            named(now - 120 * DAY, None),            // past 90 days
            named(now - 150 * DAY, Some("Chapter")), // labelled: kept
        ];
        let mut gone = to_prune(&list, now, Retention::default());
        gone.sort();
        let mut expected = vec![list[3].0.clone(), list[5].0.clone()];
        expected.sort();
        assert_eq!(gone, expected);

        // A note untouched for a season keeps its newest.
        let old = vec![named(now - 300 * DAY, None), named(now - 301 * DAY, None)];
        assert_eq!(
            to_prune(&old, now, Retention::default()),
            vec![old[1].0.clone()]
        );
    }

    #[test]
    fn pruning_on_disk_removes_files_and_empty_folders() {
        let (_d, folio) = temp_folio();
        let root = folio.root();
        let now = 400 * DAY;
        let dir = dir_for(root, "gone/old.md").unwrap();
        write_snapshot(&dir, b"a", now - 200 * DAY, None).unwrap();
        write_snapshot(&dir, b"b", now - 100 * DAY, None).unwrap();
        let keep = dir_for(root, "kept.md").unwrap();
        write_snapshot(&keep, b"c", now - 200 * DAY, Some("Keep")).unwrap();
        write_snapshot(&keep, b"d", now - 199 * DAY, None).unwrap();
        write_snapshot(&keep, b"e", now - 60, None).unwrap();

        assert_eq!(prune(root, now, Retention::default()).unwrap(), 2);
        assert_eq!(entries(&dir).len(), 1, "the newest stays");
        assert_eq!(entries(&keep).len(), 2);
        assert_eq!(usage(root).count, 3);
        assert_eq!(usage(root).bytes, 3);
    }

    #[test]
    fn history_follows_a_renamed_note_and_a_renamed_folder() {
        let (_d, folio) = temp_folio();
        folio.create_folder("drafts").unwrap();
        fs::write(folio.root().join("drafts/one.md"), "text").unwrap();
        folio.take_snapshot("drafts/one.md", None).unwrap();

        folio.rename("drafts/one.md", "drafts/uno.md").unwrap();
        assert_eq!(folio.snapshots("drafts/uno.md").unwrap().len(), 1);
        assert!(folio.snapshots("drafts/one.md").unwrap().is_empty());

        folio.rename("drafts", "final").unwrap();
        assert_eq!(folio.snapshots("final/uno.md").unwrap().len(), 1);

        // Moving onto a name that already has history merges the two.
        fs::write(folio.root().join("final/dos.md"), "other").unwrap();
        folio.take_snapshot("final/dos.md", Some("Dos")).unwrap();
        move_history(folio.root(), "final/uno.md", "final/dos.md").unwrap();
        assert_eq!(folio.snapshots("final/dos.md").unwrap().len(), 2);
    }

    #[test]
    fn words_leave_out_front_matter_and_punctuation() {
        assert_eq!(word_count("---\ntype: scene\n---\nOne two — three.\n"), 3);
        assert_eq!(word_count("no front matter here"), 4);
    }
}
