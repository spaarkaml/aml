//! Link resolution and rename propagation (WP-2.2). Resolution is the single rule for what
//! `[[Target]]` or `[text](rel.md)` points at; rename propagation rewrites exactly the target
//! spans of the links that resolve to a moved note, line by line, with a preview first.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::extract::{extract, link_key, percent_encode_path, LinkFact};
use super::{sql_err, Index};
use crate::folio::{write_atomic, Result};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LinkQuery {
    pub target: String,
    /// `wiki`, `embed` or `md`.
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LinkEdit {
    /// 1-based line.
    pub line: u32,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteEdits {
    /// Path before the rename.
    pub path: String,
    /// Path after the rename (differs only for notes inside the renamed entry).
    pub new_path: String,
    pub edits: Vec<LinkEdit>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenamePreview {
    pub from: String,
    pub to: String,
    pub notes: Vec<NoteEdits>,
    /// Total links that would be rewritten.
    pub links: u32,
}

fn parent_dir(path: &str) -> &str {
    path.rfind('/').map(|i| &path[..i]).unwrap_or("")
}

fn strip_md(s: &str) -> &str {
    s.strip_suffix(".md")
        .or_else(|| s.strip_suffix(".MD"))
        .unwrap_or(s)
}

/// Joins `dir` and a relative `target`, folding `.` and `..`; `None` if it escapes the root.
pub fn normalise(dir: &str, target: &str) -> Option<String> {
    let mut parts: Vec<&str> = dir.split('/').filter(|p| !p.is_empty()).collect();
    for seg in target.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    Some(parts.join("/"))
}

/// Relative path from directory `from_dir` to file `to_path`.
pub fn relative_path(from_dir: &str, to_path: &str) -> String {
    let a: Vec<&str> = from_dir.split('/').filter(|p| !p.is_empty()).collect();
    let b: Vec<&str> = to_path.split('/').filter(|p| !p.is_empty()).collect();
    let common = a.iter().zip(b.iter()).take_while(|(x, y)| x == y).count();
    let mut out: Vec<&str> = Vec::new();
    out.extend(std::iter::repeat_n("..", a.len() - common));
    out.extend_from_slice(&b[common..]);
    out.join("/")
}

fn remap(path: &str, from: &str, to: &str) -> String {
    if path == from {
        to.to_string()
    } else if let Some(rest) = path.strip_prefix(from).filter(|_| path.len() > from.len()) {
        if rest.starts_with('/') {
            format!("{to}{rest}")
        } else {
            path.to_string()
        }
    } else {
        path.to_string()
    }
}

impl Index {
    /// The note a link points at, or `None` when nothing matches.
    pub fn resolve(&self, from: &str, target: &str, kind: &str) -> Result<Option<String>> {
        let target = target.trim();
        if target.is_empty() {
            return Ok(None);
        }
        if kind == "md" {
            let Some(path) = normalise(parent_dir(from), target) else {
                return Ok(None);
            };
            return self.path_ci(&path);
        }
        let bare = strip_md(target);
        if bare.contains('/') {
            let lower = format!("{}.md", bare.to_lowercase());
            let mut stmt = self
                .conn
                .prepare_cached(
                    "SELECT path FROM notes WHERE lower(path) = ?1 OR lower(path) LIKE '%/' || ?1 ESCAPE '\\' ORDER BY length(path), path LIMIT 1",
                )
                .map_err(sql_err)?;
            let hit = stmt
                .query_row(params![like_safe(&lower)], |r| r.get::<_, String>(0))
                .ok();
            if let Some(h) = hit {
                if h.to_lowercase() == lower || h.to_lowercase().ends_with(&format!("/{lower}")) {
                    return Ok(Some(h));
                }
            }
            return Ok(None);
        }
        let key = link_key(bare);
        let mut stmt = self
            .conn
            .prepare_cached("SELECT path FROM notes WHERE stem = ?1 ORDER BY length(path), path")
            .map_err(sql_err)?;
        let same_stem: Vec<String> = stmt
            .query_map(params![key], |r| r.get(0))
            .map_err(sql_err)?
            .flatten()
            .collect();
        if !same_stem.is_empty() {
            let dir = parent_dir(from);
            let local = same_stem.iter().find(|p| parent_dir(p) == dir);
            return Ok(Some(local.cloned().unwrap_or_else(|| same_stem[0].clone())));
        }
        let lower = bare.to_lowercase();
        let by_title: Option<String> = self
            .conn
            .query_row(
                "SELECT path FROM notes WHERE lower(title) = ?1 ORDER BY length(path), path LIMIT 1",
                params![lower],
                |r| r.get(0),
            )
            .ok();
        if by_title.is_some() {
            return Ok(by_title);
        }
        let by_alias: Option<String> = self
            .conn
            .query_row(
                "SELECT n.path FROM aliases a JOIN notes n ON n.id = a.note WHERE lower(a.alias) = ?1 ORDER BY length(n.path), n.path LIMIT 1",
                params![lower],
                |r| r.get(0),
            )
            .ok();
        Ok(by_alias)
    }

    fn path_ci(&self, path: &str) -> Result<Option<String>> {
        let hit = self
            .conn
            .query_row(
                "SELECT path FROM notes WHERE lower(path) = ?1 LIMIT 1",
                params![path.to_lowercase()],
                |r| r.get::<_, String>(0),
            )
            .ok();
        Ok(hit)
    }

    /// True when another note (not `except`) already has this file stem.
    fn stem_taken(&self, stem: &str, except: &HashSet<&str>) -> Result<bool> {
        let mut stmt = self
            .conn
            .prepare_cached("SELECT path FROM notes WHERE stem = ?1")
            .map_err(sql_err)?;
        let paths: Vec<String> = stmt
            .query_map(params![stem.to_lowercase()], |r| r.get(0))
            .map_err(sql_err)?
            .flatten()
            .collect();
        Ok(paths.iter().any(|p| !except.contains(p.as_str())))
    }

    /// What renaming `from` (a note or a folder) to `to` would change in other notes' links —
    /// and in the moved notes' own relative links. Computed against the index as it is now,
    /// so call it before the file-system rename.
    pub fn rename_preview(&self, from: &str, to: &str) -> Result<RenamePreview> {
        let mut moved: Vec<(String, String)> = Vec::new();
        if self.path_ci(from)?.is_some() {
            moved.push((from.to_string(), to.to_string()));
        } else {
            let mut stmt = self
                .conn
                .prepare("SELECT path FROM notes WHERE path LIKE ?1 ESCAPE '\\'")
                .map_err(sql_err)?;
            let under: Vec<String> = stmt
                .query_map(params![format!("{}/%", like_safe(from))], |r| r.get(0))
                .map_err(sql_err)?
                .flatten()
                .collect();
            for p in under {
                let n = remap(&p, from, to);
                moved.push((p, n));
            }
        }
        let mut preview = RenamePreview {
            from: from.to_string(),
            to: to.to_string(),
            notes: Vec::new(),
            links: 0,
        };
        if moved.is_empty() {
            return Ok(preview);
        }
        let moved_map: HashMap<&str, &str> = moved
            .iter()
            .map(|(a, b)| (a.as_str(), b.as_str()))
            .collect();
        let moved_set: HashSet<&str> = moved_map.keys().copied().collect();

        // Candidates: notes with a link whose key is a moved note's stem, plus the moved notes.
        let mut candidates: Vec<String> = Vec::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT DISTINCT n.path FROM links l JOIN notes n ON n.id = l.note WHERE l.key = ?1")
                .map_err(sql_err)?;
            let mut seen = HashSet::new();
            for (old, _) in &moved {
                let key = link_key(old);
                let rows = stmt
                    .query_map(params![key], |r| r.get::<_, String>(0))
                    .map_err(sql_err)?;
                for p in rows.flatten() {
                    if seen.insert(p.clone()) {
                        candidates.push(p);
                    }
                }
            }
            for (old, _) in &moved {
                if seen.insert(old.clone()) {
                    candidates.push(old.clone());
                }
            }
        }
        candidates.sort();

        for path in candidates {
            let text = fs::read_to_string(self.root.join(&path)).unwrap_or_default();
            let new_path = remap(&path, from, to);
            let new_dir = parent_dir(&new_path).to_string();
            let facts = extract(&text);
            let mut by_line: HashMap<u32, Vec<(&LinkFact, String)>> = HashMap::new();
            for link in &facts.links {
                let Some(resolved) = self.resolve(&path, &link.target, link.kind)? else {
                    continue;
                };
                let destination = moved_map.get(resolved.as_str()).copied();
                let new_target = match (link.kind, destination) {
                    ("md", Some(dest)) => percent_encode_path(&relative_path(&new_dir, dest)),
                    ("md", None) if new_dir != parent_dir(&path) => {
                        percent_encode_path(&relative_path(&new_dir, &resolved))
                    }
                    ("md", None) => continue,
                    (_, Some(dest)) => {
                        let keep_ext = link.target.to_lowercase().ends_with(".md");
                        let full = if keep_ext {
                            dest.to_string()
                        } else {
                            strip_md(dest).to_string()
                        };
                        if link.target.contains('/') {
                            full
                        } else {
                            let stem = strip_md(dest.rsplit('/').next().unwrap_or(dest));
                            if self.stem_taken(stem, &moved_set)? {
                                full
                            } else if keep_ext {
                                format!("{stem}.md")
                            } else {
                                stem.to_string()
                            }
                        }
                    }
                    (_, None) => continue,
                };
                if new_target == link.target {
                    continue;
                }
                by_line
                    .entry(link.line)
                    .or_default()
                    .push((link, new_target));
            }
            if by_line.is_empty() {
                continue;
            }
            let lines: Vec<&str> = text.lines().collect();
            let mut edits: Vec<LinkEdit> = by_line
                .into_iter()
                .filter_map(|(line_no, mut items)| {
                    let before = *lines.get(line_no as usize - 1)?;
                    items.sort_by_key(|(l, _)| std::cmp::Reverse(l.span.0));
                    let mut after = before.to_string();
                    for (l, t) in &items {
                        after.replace_range(l.span.0..l.span.1, t);
                    }
                    preview.links += items.len() as u32;
                    Some(LinkEdit {
                        line: line_no,
                        before: before.to_string(),
                        after,
                    })
                })
                .collect();
            edits.sort_by_key(|e| e.line);
            preview.notes.push(NoteEdits {
                path,
                new_path,
                edits,
            });
        }
        Ok(preview)
    }
}

fn like_safe(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Applies previewed edits to the files at their post-rename paths. A line that no longer
/// matches its `before` is skipped. Returns the number of lines rewritten.
pub fn apply_edits(root: &Path, notes: &[NoteEdits]) -> Result<u32> {
    let mut applied = 0;
    for note in notes {
        let abs = root.join(&note.new_path);
        let Ok(text) = fs::read_to_string(&abs) else {
            continue;
        };
        let mut lines: Vec<String> = text.split('\n').map(str::to_string).collect();
        let mut changed = false;
        for edit in &note.edits {
            let Some(slot) = lines.get_mut(edit.line as usize - 1) else {
                continue;
            };
            let cr = slot.ends_with('\r');
            let body = slot.trim_end_matches('\r');
            if body != edit.before {
                continue;
            }
            *slot = if cr {
                format!("{}\r", edit.after)
            } else {
                edit.after.clone()
            };
            changed = true;
            applied += 1;
        }
        if changed {
            write_atomic(&abs, lines.join("\n").as_bytes())?;
        }
    }
    Ok(applied)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folio::Folio;

    fn folio_with(notes: &[(&str, &str)]) -> (tempfile::TempDir, Folio, Index) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("T")).unwrap();
        for (path, text) in notes {
            let abs = dir.path().join(path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(abs, text).unwrap();
        }
        let idx = Index::open(&dir.path().join("idx.sqlite"), &folio).unwrap();
        idx.refresh(&mut |_, _| {}).unwrap();
        (dir, folio, idx)
    }

    #[test]
    fn path_helpers() {
        assert_eq!(normalise("a/b", "../c.md").as_deref(), Some("a/c.md"));
        assert_eq!(normalise("", "./x.md").as_deref(), Some("x.md"));
        assert_eq!(normalise("a", "../../x.md"), None);
        assert_eq!(relative_path("a/b", "a/c/d.md"), "../c/d.md");
        assert_eq!(relative_path("", "x.md"), "x.md");
        assert_eq!(relative_path("a", "a/x.md"), "x.md");
        assert_eq!(remap("f/x.md", "f", "g"), "g/x.md");
        assert_eq!(remap("foo/x.md", "f", "g"), "foo/x.md");
    }

    #[test]
    fn resolves_wiki_md_title_and_alias() {
        let (_d, _f, idx) = folio_with(&[
            ("a/Note.md", "one\n"),
            ("b/Note.md", "two\n"),
            (
                "Deep/Sub/Thing.md",
                "---\ntitle: The Thing\naliases: [tt]\n---\n",
            ),
            ("Start.md", "x\n"),
        ]);
        // Same folder wins, then shortest path.
        assert_eq!(
            idx.resolve("a/Start.md", "note", "wiki")
                .unwrap()
                .as_deref(),
            Some("a/Note.md")
        );
        assert_eq!(
            idx.resolve("Start.md", "Note", "wiki").unwrap().as_deref(),
            Some("a/Note.md")
        );
        assert_eq!(
            idx.resolve("Start.md", "b/Note", "wiki")
                .unwrap()
                .as_deref(),
            Some("b/Note.md")
        );
        assert_eq!(
            idx.resolve("Start.md", "Sub/Thing.md", "wiki")
                .unwrap()
                .as_deref(),
            Some("Deep/Sub/Thing.md")
        );
        assert_eq!(
            idx.resolve("Start.md", "the thing", "wiki")
                .unwrap()
                .as_deref(),
            Some("Deep/Sub/Thing.md")
        );
        assert_eq!(
            idx.resolve("Start.md", "TT", "wiki").unwrap().as_deref(),
            Some("Deep/Sub/Thing.md")
        );
        assert_eq!(idx.resolve("Start.md", "Nope", "wiki").unwrap(), None);
        assert_eq!(
            idx.resolve("a/Start.md", "../b/note.md", "md")
                .unwrap()
                .as_deref(),
            Some("b/Note.md")
        );
        assert_eq!(idx.resolve("a/Start.md", "../../x.md", "md").unwrap(), None);
    }

    #[test]
    fn rename_note_rewrites_every_link_kind() {
        let (dir, _f, idx) = folio_with(&[
            ("Target.md", "t\n"),
            ("Other.md", "x\n"),
            (
                "Linker.md",
                "See [[Target]] and [[Target#Part|alias]] and [t](Target.md) and `[[Target]]`.\nAlso [[Other]].\n",
            ),
            ("sub/Deep.md", "[[Target]] twice [[target.md]]\n[deep](../Target.md#H)\n"),
        ]);
        let p = idx.rename_preview("Target.md", "sub/New Name.md").unwrap();
        assert_eq!(p.links, 6);
        assert_eq!(p.notes.len(), 2);
        let linker = &p.notes[0];
        assert_eq!(linker.path, "Linker.md");
        assert_eq!(linker.new_path, "Linker.md");
        assert_eq!(linker.edits.len(), 1);
        assert_eq!(
            linker.edits[0].after,
            "See [[New Name]] and [[New Name#Part|alias]] and [t](sub/New%20Name.md) and `[[Target]]`."
        );
        let deep = &p.notes[1];
        assert_eq!(deep.edits[0].after, "[[New Name]] twice [[New Name.md]]");
        assert_eq!(deep.edits[1].after, "[deep](New%20Name.md#H)");

        // Apply after the file-system rename.
        fs::create_dir_all(dir.path().join("sub")).unwrap();
        fs::rename(
            dir.path().join("Target.md"),
            dir.path().join("sub/New Name.md"),
        )
        .unwrap();
        let n = apply_edits(dir.path(), &p.notes).unwrap();
        assert_eq!(n, 3);
        let linker_text = fs::read_to_string(dir.path().join("Linker.md")).unwrap();
        assert!(linker_text.contains("[[New Name#Part|alias]]"));
        assert!(linker_text.ends_with("Also [[Other]].\n"));
        // Re-index and check every link resolves to the new note.
        idx.refresh(&mut |_, _| {}).unwrap();
        for (from, t, k) in [
            ("Linker.md", "New Name", "wiki"),
            ("Linker.md", "sub/New%20Name.md", "md"),
        ] {
            let t = t.replace("%20", " ");
            assert_eq!(
                idx.resolve(from, &t, k).unwrap().as_deref(),
                Some("sub/New Name.md")
            );
        }
    }

    #[test]
    fn ambiguous_stem_uses_full_path_and_folder_rename_moves_children() {
        let (dir, _f, idx) = folio_with(&[
            ("Ch/One.md", "[two](Two.md) and [[Root]]\n"),
            ("Ch/Two.md", "[[One]]\n"),
            ("Root.md", "[[One]] [[Ch/Two]]\n"),
            ("Else/Fresh.md", "y\n"),
        ]);
        // Renaming Ch/One.md to Ch/Fresh.md collides with Else/Fresh.md's stem: full path.
        let p = idx.rename_preview("Ch/One.md", "Ch/Fresh.md").unwrap();
        let root = p.notes.iter().find(|n| n.path == "Root.md").unwrap();
        assert_eq!(root.edits[0].after, "[[Ch/Fresh]] [[Ch/Two]]");
        let two = p.notes.iter().find(|n| n.path == "Ch/Two.md").unwrap();
        assert_eq!(two.edits[0].after, "[[Ch/Fresh]]");

        // Folder rename: children move; links into the folder update; the children's own
        // relative md links keep working (same folder → unchanged).
        let p = idx.rename_preview("Ch", "Chapters").unwrap();
        let root = p.notes.iter().find(|n| n.path == "Root.md").unwrap();
        assert_eq!(root.edits[0].after, "[[One]] [[Chapters/Two]]");
        let one = p.notes.iter().find(|n| n.path == "Ch/One.md");
        assert!(
            one.is_none(),
            "nothing to rewrite inside a note moved with its neighbours"
        );
        fs::rename(dir.path().join("Ch"), dir.path().join("Chapters")).unwrap();
        assert_eq!(apply_edits(dir.path(), &p.notes).unwrap(), 1);
        assert!(fs::read_to_string(dir.path().join("Root.md"))
            .unwrap()
            .contains("[[Chapters/Two]]"));
    }

    #[test]
    fn moving_a_note_between_folders_fixes_its_own_relative_links() {
        let (_d, _f, idx) = folio_with(&[
            ("a/Mover.md", "[s](Sibling.md) and [[Sibling]]\n"),
            ("a/Sibling.md", "s\n"),
        ]);
        let p = idx.rename_preview("a/Mover.md", "b/Mover.md").unwrap();
        let mover = p.notes.iter().find(|n| n.path == "a/Mover.md").unwrap();
        assert_eq!(mover.new_path, "b/Mover.md");
        assert_eq!(mover.edits[0].after, "[s](../a/Sibling.md) and [[Sibling]]");
    }

    #[test]
    fn apply_skips_lines_that_changed_meanwhile() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("n.md"), "keep\n[[Old]]\r\nend").unwrap();
        let edits = vec![NoteEdits {
            path: "n.md".into(),
            new_path: "n.md".into(),
            edits: vec![
                LinkEdit {
                    line: 2,
                    before: "[[Old]]".into(),
                    after: "[[New]]".into(),
                },
                LinkEdit {
                    line: 3,
                    before: "different".into(),
                    after: "x".into(),
                },
            ],
        }];
        assert_eq!(apply_edits(dir.path(), &edits).unwrap(), 1);
        assert_eq!(
            fs::read_to_string(dir.path().join("n.md")).unwrap(),
            "keep\n[[New]]\r\nend"
        );
    }
}
