//! The Folio index (ADR-007): one SQLite file per Folio in local app-data, holding every
//! note's title, aliases, headings, tags, links and front-matter properties plus an FTS5
//! table over title and body. Built on a background thread, kept current from the watcher,
//! rebuilt on demand. Never lives inside the Folio (ADR-004).

pub mod extract;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::folio::{is_ignored_name, mtime_ms, Folio, FolioError, Result};
use extract::{extract, NoteFacts};

const SCHEMA_VERSION: i64 = 1;

/// Quick Open's view of a note (ADR-007: fuzzy ranking stays in memory on the UI side).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteIndexEntry {
    pub path: String,
    /// Front-matter `title:` if present, else the file name without `.md`.
    pub title: String,
    pub aliases: Vec<String>,
    pub headings: Vec<String>,
    #[specta(type = specta_typescript::Number)]
    pub mtime: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    /// Notes currently in the index.
    pub notes: u32,
    pub building: bool,
    /// Progress of the running build, if any.
    pub done: u32,
    pub total: u32,
    /// Unix ms of the last completed build or refresh; 0 if never.
    #[specta(type = specta_typescript::Number)]
    pub last_built: u64,
    /// Milliseconds the last build or refresh took.
    #[specta(type = specta_typescript::Number)]
    pub last_duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    /// Matching excerpt with `«»` around the hit terms.
    pub snippet: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuildStats {
    pub scanned: u32,
    pub indexed: u32,
    pub removed: u32,
    pub duration_ms: u64,
}

/// Shared between the Folio's index handle and a build running on another thread.
#[derive(Default)]
pub struct Progress {
    building: AtomicBool,
    done: AtomicU32,
    total: AtomicU32,
}

pub struct Index {
    conn: Connection,
    db_path: PathBuf,
    root: PathBuf,
    progress: Arc<Progress>,
}

/// `<app-data>/index/<hash-of-root>.sqlite`, so two Folios never share a database.
pub fn db_path_for(app_data: &Path, root: &Path) -> PathBuf {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in root.to_string_lossy().as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    app_data.join("index").join(format!("{h:016x}.sqlite"))
}

fn sql_err(e: rusqlite::Error) -> FolioError {
    FolioError::Io(format!("index: {e}"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn file_title(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
        .to_string()
}

fn is_note(name: &str) -> bool {
    name.to_lowercase().ends_with(".md")
}

/// Every note under `dir` as (Folio-relative path, mtime ms, size).
fn walk_notes(dir: &Path, prefix: &str, out: &mut Vec<(String, u64, u64)>) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_name(&name) {
            continue;
        }
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            walk_notes(&entry.path(), &rel, out);
        } else if meta.is_file() && is_note(&name) {
            out.push((rel, mtime_ms(&meta), meta.len()));
        }
    }
}

impl Index {
    /// Opens (creating if needed) the database for `folio` at `db_path`.
    pub fn open(db_path: &Path, folio: &Folio) -> Result<Self> {
        if let Some(dir) = db_path.parent() {
            fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(db_path).map_err(sql_err)?;
        let index = Self {
            conn,
            db_path: db_path.to_path_buf(),
            root: folio.root().to_path_buf(),
            progress: Arc::new(Progress::default()),
        };
        index.prepare()?;
        Ok(index)
    }

    /// A second handle on the same database for a build thread; shares the progress state.
    pub fn for_thread(&self) -> Result<Self> {
        let conn = Connection::open(&self.db_path).map_err(sql_err)?;
        let index = Self {
            conn,
            db_path: self.db_path.clone(),
            root: self.root.clone(),
            progress: Arc::clone(&self.progress),
        };
        index.prepare()?;
        Ok(index)
    }

    fn prepare(&self) -> Result<()> {
        self.conn
            .busy_timeout(std::time::Duration::from_secs(15))
            .map_err(sql_err)?;
        self.conn
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
            )
            .map_err(sql_err)?;
        let version: Option<i64> = self
            .conn
            .query_row("SELECT value FROM meta WHERE key='schema'", [], |r| {
                r.get::<_, String>(0).map(|v| v.parse().unwrap_or(0))
            })
            .optional()
            .unwrap_or(None);
        if version != Some(SCHEMA_VERSION) {
            self.conn
                .execute_batch(
                    "DROP TABLE IF EXISTS notes_fts; DROP TABLE IF EXISTS props; DROP TABLE IF EXISTS links;
                     DROP TABLE IF EXISTS tags; DROP TABLE IF EXISTS headings; DROP TABLE IF EXISTS aliases;
                     DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS meta;
                     CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                     CREATE TABLE notes(id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, stem TEXT NOT NULL,
                        title TEXT NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL, words INTEGER NOT NULL);
                     CREATE INDEX notes_stem ON notes(stem);
                     CREATE TABLE aliases(note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, alias TEXT NOT NULL);
                     CREATE INDEX aliases_note ON aliases(note);
                     CREATE TABLE headings(note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                        level INTEGER NOT NULL, text TEXT NOT NULL, line INTEGER NOT NULL);
                     CREATE INDEX headings_note ON headings(note);
                     CREATE TABLE tags(note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, tag TEXT NOT NULL, line INTEGER NOT NULL);
                     CREATE INDEX tags_note ON tags(note); CREATE INDEX tags_tag ON tags(tag);
                     CREATE TABLE links(note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, target TEXT NOT NULL,
                        key TEXT NOT NULL, heading TEXT, alias TEXT, kind TEXT NOT NULL, line INTEGER NOT NULL);
                     CREATE INDEX links_note ON links(note); CREATE INDEX links_key ON links(key);
                     CREATE TABLE props(note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL);
                     CREATE INDEX props_note ON props(note); CREATE INDEX props_key ON props(key);
                     CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, tokenize='unicode61 remove_diacritics 2');",
                )
                .map_err(sql_err)?;
            self.conn
                .execute(
                    "INSERT INTO meta(key, value) VALUES('schema', ?1)",
                    params![SCHEMA_VERSION.to_string()],
                )
                .map_err(sql_err)?;
        }
        Ok(())
    }

    fn meta_u64(&self, key: &str) -> u64 {
        self.conn
            .query_row("SELECT value FROM meta WHERE key=?1", params![key], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    }

    fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO meta(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                params![key, value],
            )
            .map_err(sql_err)?;
        Ok(())
    }

    pub fn status(&self) -> IndexStatus {
        let notes: u32 = self
            .conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap_or(0);
        IndexStatus {
            notes,
            building: self.progress.building.load(Ordering::Relaxed),
            done: self.progress.done.load(Ordering::Relaxed),
            total: self.progress.total.load(Ordering::Relaxed),
            last_built: self.meta_u64("last_built"),
            last_duration_ms: self.meta_u64("last_duration_ms"),
        }
    }

    pub fn is_building(&self) -> bool {
        self.progress.building.load(Ordering::Relaxed)
    }

    /// Drops every row and indexes the Folio from scratch.
    pub fn rebuild(&self, on_progress: &mut dyn FnMut(u32, u32)) -> Result<BuildStats> {
        self.conn
            .execute_batch("DELETE FROM notes; DELETE FROM notes_fts;")
            .map_err(sql_err)?;
        self.refresh(on_progress)
    }

    /// Brings the index in line with the disk: re-reads notes whose mtime or size moved,
    /// drops notes that vanished. On an empty database this is the initial build.
    pub fn refresh(&self, on_progress: &mut dyn FnMut(u32, u32)) -> Result<BuildStats> {
        let started = Instant::now();
        let mut on_disk = Vec::new();
        walk_notes(&self.root, "", &mut on_disk);
        let known: HashMap<String, (u64, u64)> = {
            let mut stmt = self
                .conn
                .prepare("SELECT path, mtime, size FROM notes")
                .map_err(sql_err)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        (r.get::<_, i64>(1)? as u64, r.get::<_, i64>(2)? as u64),
                    ))
                })
                .map_err(sql_err)?;
            rows.filter_map(|r| r.ok()).collect()
        };
        let stale: Vec<&(String, u64, u64)> = on_disk
            .iter()
            .filter(|(p, m, s)| known.get(p) != Some(&(*m, *s)))
            .collect();
        let present: std::collections::HashSet<&str> =
            on_disk.iter().map(|(p, _, _)| p.as_str()).collect();
        let gone: Vec<&String> = known
            .keys()
            .filter(|p| !present.contains(p.as_str()))
            .collect();

        let total = stale.len() as u32;
        self.progress.building.store(true, Ordering::Relaxed);
        self.progress.total.store(total, Ordering::Relaxed);
        self.progress.done.store(0, Ordering::Relaxed);
        on_progress(0, total);

        let result = (|| -> Result<u32> {
            let tx = self.conn.unchecked_transaction().map_err(sql_err)?;
            for path in &gone {
                delete_note(&tx, path)?;
            }
            let mut indexed = 0;
            for (i, (path, mtime, size)) in stale.iter().enumerate() {
                let text = fs::read_to_string(self.root.join(path)).unwrap_or_default();
                upsert_note(&tx, path, *mtime, *size, &extract(&text))?;
                indexed += 1;
                let done = i as u32 + 1;
                self.progress.done.store(done, Ordering::Relaxed);
                if done % 100 == 0 {
                    on_progress(done, total);
                }
            }
            tx.commit().map_err(sql_err)?;
            Ok(indexed)
        })();
        self.progress.building.store(false, Ordering::Relaxed);
        let indexed = result?;
        let duration_ms = started.elapsed().as_millis() as u64;
        self.set_meta("last_built", &now_ms().to_string())?;
        self.set_meta("last_duration_ms", &duration_ms.to_string())?;
        on_progress(total, total);
        Ok(BuildStats {
            scanned: on_disk.len() as u32,
            indexed,
            removed: gone.len() as u32,
            duration_ms,
        })
    }

    /// Applies watcher changes: each path is re-read if it is a note that exists, walked if
    /// it is a folder, and dropped (with everything beneath it) if it is gone.
    pub fn update_paths(&self, paths: &[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction().map_err(sql_err)?;
        for rel in paths {
            let abs = self.root.join(rel);
            match fs::metadata(&abs) {
                Ok(meta) if meta.is_dir() => {
                    let mut notes = Vec::new();
                    walk_notes(&abs, rel, &mut notes);
                    for (path, mtime, size) in notes {
                        let text = fs::read_to_string(self.root.join(&path)).unwrap_or_default();
                        upsert_note(&tx, &path, mtime, size, &extract(&text))?;
                    }
                }
                Ok(meta) if meta.is_file() => {
                    if is_note(rel) {
                        let text = fs::read_to_string(&abs).unwrap_or_default();
                        upsert_note(&tx, rel, mtime_ms(&meta), meta.len(), &extract(&text))?;
                    }
                }
                _ => {
                    delete_note(&tx, rel)?;
                    tx.execute(
                        "DELETE FROM notes_fts WHERE rowid IN (SELECT id FROM notes WHERE path LIKE ?1 ESCAPE '\\')",
                        params![format!("{}/%", like_escape(rel))],
                    )
                    .map_err(sql_err)?;
                    tx.execute(
                        "DELETE FROM notes WHERE path LIKE ?1 ESCAPE '\\'",
                        params![format!("{}/%", like_escape(rel))],
                    )
                    .map_err(sql_err)?;
                }
            }
        }
        tx.commit().map_err(sql_err)
    }

    /// Everything Quick Open needs, sorted by path.
    pub fn quick_entries(&self) -> Result<Vec<NoteIndexEntry>> {
        let mut by_id: HashMap<i64, NoteIndexEntry> = HashMap::new();
        let mut order = Vec::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT id, path, title, mtime FROM notes ORDER BY path")
                .map_err(sql_err)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        NoteIndexEntry {
                            path: r.get(1)?,
                            title: r.get(2)?,
                            aliases: Vec::new(),
                            headings: Vec::new(),
                            mtime: r.get::<_, i64>(3)? as u64,
                        },
                    ))
                })
                .map_err(sql_err)?;
            for row in rows {
                let (id, entry) = row.map_err(sql_err)?;
                order.push(id);
                by_id.insert(id, entry);
            }
        }
        {
            let mut stmt = self
                .conn
                .prepare("SELECT note, alias FROM aliases ORDER BY rowid")
                .map_err(sql_err)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
                .map_err(sql_err)?;
            for row in rows.flatten() {
                if let Some(e) = by_id.get_mut(&row.0) {
                    e.aliases.push(row.1);
                }
            }
        }
        {
            let mut stmt = self
                .conn
                .prepare("SELECT note, text FROM headings ORDER BY note, line")
                .map_err(sql_err)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
                .map_err(sql_err)?;
            for row in rows.flatten() {
                if let Some(e) = by_id.get_mut(&row.0) {
                    e.headings.push(row.1);
                }
            }
        }
        Ok(order
            .into_iter()
            .filter_map(|id| by_id.remove(&id))
            .collect())
    }

    /// Full-text search over titles and bodies. `query` is plain words (all must match,
    /// prefix on the last one) or a `"quoted phrase"`; the query language arrives in WP-2.5.
    pub fn search(&self, query: &str, limit: u32) -> Result<Vec<SearchHit>> {
        let Some(fts) = fts_query(query) else {
            return Ok(Vec::new());
        };
        let mut stmt = self
            .conn
            .prepare(
                "SELECT n.path, n.title, snippet(notes_fts, 1, '«', '»', '…', 12)
                 FROM notes_fts f JOIN notes n ON n.id = f.rowid
                 WHERE notes_fts MATCH ?1 ORDER BY bm25(notes_fts, 4.0, 1.0) LIMIT ?2",
            )
            .map_err(sql_err)?;
        let rows = stmt
            .query_map(params![fts, limit], |r| {
                Ok(SearchHit {
                    path: r.get(0)?,
                    title: r.get(1)?,
                    snippet: r.get(2)?,
                })
            })
            .map_err(sql_err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(sql_err)
    }
}

fn like_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Turns user text into an FTS5 expression: each word quoted (so FTS syntax cannot break
/// it), the last one as a prefix; a phrase in double quotes stays a phrase.
pub fn fts_query(query: &str) -> Option<String> {
    let q = query.trim();
    if q.is_empty() {
        return None;
    }
    let mut terms = Vec::new();
    let mut rest = q;
    while !rest.is_empty() {
        rest = rest.trim_start();
        if let Some(after) = rest.strip_prefix('"') {
            let end = after.find('"').unwrap_or(after.len());
            let phrase = after[..end].trim();
            if !phrase.is_empty() {
                terms.push(format!("\"{}\"", phrase.replace('"', "\"\"")));
            }
            rest = after.get(end + 1..).unwrap_or("");
        } else {
            let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
            let word = &rest[..end];
            let clean: String = word.chars().filter(|c| c.is_alphanumeric()).collect();
            if !clean.is_empty() {
                terms.push(format!("\"{clean}\""));
            }
            rest = &rest[end..];
        }
    }
    if terms.is_empty() {
        return None;
    }
    if !q.ends_with('"') {
        if let Some(last) = terms.last_mut() {
            last.push('*');
        }
    }
    Some(terms.join(" AND "))
}

fn delete_note(conn: &Connection, path: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM notes_fts WHERE rowid IN (SELECT id FROM notes WHERE path = ?1)",
        params![path],
    )
    .map_err(sql_err)?;
    conn.execute("DELETE FROM notes WHERE path = ?1", params![path])
        .map_err(sql_err)?;
    Ok(())
}

fn upsert_note(
    conn: &Connection,
    path: &str,
    mtime: u64,
    size: u64,
    facts: &NoteFacts,
) -> Result<()> {
    delete_note(conn, path)?;
    let title = facts.title.clone().unwrap_or_else(|| file_title(path));
    conn.execute(
        "INSERT INTO notes(path, stem, title, mtime, size, words) VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            path,
            file_title(path).to_lowercase(),
            title,
            mtime as i64,
            size as i64,
            facts.words
        ],
    )
    .map_err(sql_err)?;
    let id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO notes_fts(rowid, title, body) VALUES(?1, ?2, ?3)",
        params![id, title, facts.body],
    )
    .map_err(sql_err)?;
    let mut stmt = conn
        .prepare_cached("INSERT INTO aliases(note, alias) VALUES(?1, ?2)")
        .map_err(sql_err)?;
    for a in &facts.aliases {
        stmt.execute(params![id, a]).map_err(sql_err)?;
    }
    let mut stmt = conn
        .prepare_cached("INSERT INTO headings(note, level, text, line) VALUES(?1, ?2, ?3, ?4)")
        .map_err(sql_err)?;
    for h in &facts.headings {
        stmt.execute(params![id, h.level, h.text, h.line])
            .map_err(sql_err)?;
    }
    let mut stmt = conn
        .prepare_cached("INSERT INTO tags(note, tag, line) VALUES(?1, ?2, ?3)")
        .map_err(sql_err)?;
    for (tag, line) in &facts.tags {
        stmt.execute(params![id, tag, line]).map_err(sql_err)?;
    }
    let mut stmt = conn
        .prepare_cached(
            "INSERT INTO links(note, target, key, heading, alias, kind, line) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .map_err(sql_err)?;
    for l in &facts.links {
        stmt.execute(params![
            id, l.target, l.key, l.heading, l.alias, l.kind, l.line
        ])
        .map_err(sql_err)?;
    }
    let mut stmt = conn
        .prepare_cached("INSERT INTO props(note, key, value) VALUES(?1, ?2, ?3)")
        .map_err(sql_err)?;
    for (k, v) in &facts.props {
        stmt.execute(params![id, k, v]).map_err(sql_err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn folio_with(notes: &[(&str, &str)]) -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("T")).unwrap();
        for (path, text) in notes {
            let abs = dir.path().join(path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(abs, text).unwrap();
        }
        (dir, folio)
    }

    fn open(dir: &tempfile::TempDir, folio: &Folio) -> Index {
        Index::open(&dir.path().join("idx.sqlite"), folio).unwrap()
    }

    #[test]
    fn builds_refreshes_and_drops() {
        let (dir, folio) = folio_with(&[
            (
                "a.md",
                "---\ntitle: Alpha\naliases: [al]\ntags: [x]\n---\n# One\nSee [[b]] #t\n",
            ),
            ("sub/b.md", "## Two\nbody words here\n"),
            ("skip.txt", "not a note"),
        ]);
        let idx = open(&dir, &folio);
        let stats = idx.refresh(&mut |_, _| {}).unwrap();
        assert_eq!((stats.scanned, stats.indexed, stats.removed), (2, 2, 0));
        let entries = idx.quick_entries().unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].title, "Alpha");
        assert_eq!(entries[0].aliases, vec!["al"]);
        assert_eq!(entries[0].headings, vec!["One"]);
        assert_eq!(entries[1].path, "sub/b.md");
        assert_eq!(entries[1].title, "b");

        // Unchanged files are not re-read; a changed one is; a removed one goes.
        let stats = idx.refresh(&mut |_, _| {}).unwrap();
        assert_eq!(stats.indexed, 0);
        std::thread::sleep(std::time::Duration::from_millis(20));
        let mut f = fs::File::create(dir.path().join("sub/b.md")).unwrap();
        f.write_all(b"## Three\nchanged\n").unwrap();
        drop(f);
        fs::remove_file(dir.path().join("a.md")).unwrap();
        let stats = idx.refresh(&mut |_, _| {}).unwrap();
        assert_eq!((stats.indexed, stats.removed), (1, 1));
        let entries = idx.quick_entries().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].headings, vec!["Three"]);
        let tags: u32 = idx
            .conn
            .query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tags, 0, "rows of a removed note cascade");
    }

    #[test]
    fn stores_links_tags_and_props() {
        let (dir, folio) = folio_with(&[(
            "n.md",
            "---\nstatus: done\ntags: [Research]\n---\n[[Other#Part|x]] and [t](sub/Deep.md) #ops/info\n",
        )]);
        let idx = open(&dir, &folio);
        idx.refresh(&mut |_, _| {}).unwrap();
        let links: Vec<(String, String, Option<String>, String)> = idx
            .conn
            .prepare("SELECT target, key, heading, kind FROM links ORDER BY rowid")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(
            links,
            vec![
                (
                    "Other".into(),
                    "other".into(),
                    Some("Part".into()),
                    "wiki".into()
                ),
                ("sub/Deep.md".into(), "deep".into(), None, "md".into()),
            ]
        );
        let tags: Vec<String> = idx
            .conn
            .prepare("SELECT tag FROM tags ORDER BY line, rowid")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(tags, vec!["research", "ops/info"]);
        let status: String = idx
            .conn
            .query_row("SELECT value FROM props WHERE key='status'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(status, "done");
    }

    #[test]
    fn full_text_search_ranks_and_snips() {
        let (dir, folio) = folio_with(&[
            (
                "one.md",
                "# Persuasion\nThe distinction between persuasion and manipulation.\n",
            ),
            ("two.md", "Nothing to see. Café culture.\n"),
            ("three.md", "manipulation manipulation manipulation\n"),
        ]);
        let idx = open(&dir, &folio);
        idx.refresh(&mut |_, _| {}).unwrap();
        let hits = idx.search("manipul", 10).unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits[0].snippet.contains("«manipulation»"));
        let hits = idx.search("\"persuasion and manipulation\"", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "one.md");
        assert_eq!(hits[0].title, "one", "title is front matter or file name");
        // Diacritics fold; FTS operators typed by the user are harmless.
        assert_eq!(idx.search("cafe", 10).unwrap().len(), 1);
        assert_eq!(idx.search("NOT OR (", 10).unwrap().len(), 0);
        assert_eq!(idx.search("   ", 10).unwrap().len(), 0);
    }

    #[test]
    fn fts_query_shapes() {
        assert_eq!(
            fts_query("hello wor").as_deref(),
            Some("\"hello\" AND \"wor\"*")
        );
        assert_eq!(
            fts_query("\"a phrase\" tail").as_deref(),
            Some("\"a phrase\" AND \"tail\"*")
        );
        assert_eq!(
            fts_query("\"only phrase\"").as_deref(),
            Some("\"only phrase\"")
        );
        assert_eq!(fts_query("*&^"), None);
    }

    #[test]
    fn update_paths_follows_files_folders_and_removals() {
        let (dir, folio) = folio_with(&[("keep.md", "k\n")]);
        let idx = open(&dir, &folio);
        idx.refresh(&mut |_, _| {}).unwrap();
        fs::create_dir_all(dir.path().join("new/inner")).unwrap();
        fs::write(dir.path().join("new/inner/x.md"), "# X\n").unwrap();
        fs::write(dir.path().join("new/y.md"), "# Y\n").unwrap();
        idx.update_paths(&["new".into()]).unwrap();
        assert_eq!(idx.quick_entries().unwrap().len(), 3);
        fs::write(dir.path().join("new/y.md"), "# Y2\n").unwrap();
        idx.update_paths(&["new/y.md".into()]).unwrap();
        let e = idx.quick_entries().unwrap();
        assert_eq!(
            e.iter().find(|e| e.path == "new/y.md").unwrap().headings,
            vec!["Y2"]
        );
        fs::remove_dir_all(dir.path().join("new")).unwrap();
        idx.update_paths(&["new".into()]).unwrap();
        assert_eq!(idx.quick_entries().unwrap().len(), 1);
        assert_eq!(idx.status().notes, 1);
        assert_eq!(
            idx.search("X", 10).unwrap().len(),
            0,
            "fts rows follow deletes"
        );
    }

    #[test]
    fn second_handle_shares_progress_and_data() {
        let (dir, folio) = folio_with(&[("a.md", "a\n")]);
        let idx = open(&dir, &folio);
        let worker = idx.for_thread().unwrap();
        worker.refresh(&mut |_, _| {}).unwrap();
        assert_eq!(idx.status().notes, 1);
        assert!(!idx.is_building());
        assert!(idx.status().last_built > 0);
    }

    #[test]
    fn db_path_is_stable_and_distinct() {
        let a = db_path_for(Path::new("/data"), Path::new("/one"));
        let b = db_path_for(Path::new("/data"), Path::new("/two"));
        assert_ne!(a, b);
        assert_eq!(a, db_path_for(Path::new("/data"), Path::new("/one")));
        assert!(a.starts_with("/data/index"));
    }

    /// Budget from the plan: 5,000 notes indexed in under 5 s. Run with `--ignored`.
    #[test]
    #[ignore]
    fn five_thousand_notes_under_five_seconds() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Big")).unwrap();
        for i in 0..5000 {
            let sub = dir.path().join(format!("folder{}", i % 25));
            fs::create_dir_all(&sub).unwrap();
            let text = format!(
                "---\ntitle: Note {i}\ntags: [t{}]\n---\n# Heading {i}\n\n{}\n\nSee [[Note {}]] and #tag{}.\n",
                i % 40,
                "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ".repeat(12),
                (i + 1) % 5000,
                i % 7
            );
            fs::write(sub.join(format!("Note {i}.md")), text).unwrap();
        }
        let idx = open(&dir, &folio);
        let stats = idx.rebuild(&mut |_, _| {}).unwrap();
        eprintln!(
            "indexed {} notes in {} ms",
            stats.indexed, stats.duration_ms
        );
        assert_eq!(stats.indexed, 5000);
        assert!(stats.duration_ms < 5000, "took {} ms", stats.duration_ms);
        let t = Instant::now();
        assert_eq!(idx.quick_entries().unwrap().len(), 5000);
        eprintln!("quick_entries in {} ms", t.elapsed().as_millis());
        let t = Instant::now();
        assert!(!idx.search("lorem ipsum", 40).unwrap().is_empty());
        eprintln!("search in {} ms", t.elapsed().as_millis());
    }
}
