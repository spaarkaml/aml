//! Backlinks and unlinked mentions (WP-2.3). Backlinks are the links in other notes that
//! resolve to this note; unlinked mentions are plain-text occurrences of its name, title or
//! aliases that could become links.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::{fts_query, sql_err, Index};
use crate::folio::{write_atomic, Result};

const MENTION_LIMIT: usize = 200;
const MIN_NAME_LEN: usize = 3;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub source: String,
    pub source_title: String,
    pub line: u32,
    /// The whole line, trimmed.
    pub context: String,
    /// Nearest heading above the link, for jumping to the right section.
    pub section: Option<String>,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub source: String,
    pub source_title: String,
    pub line: u32,
    pub context: String,
    /// The text as it appears in the line (its case may differ from the name).
    pub matched: String,
    pub section: Option<String>,
}

fn file_stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// True when byte `pos` of `line` sits inside `[[…]]` or inside a `[text](url)` link.
fn in_link(line: &str, pos: usize) -> bool {
    let before = &line[..pos];
    let after = &line[pos..];
    if let Some(open) = before.rfind("[[") {
        if !before[open..].contains("]]") && after.contains("]]") {
            return true;
        }
    }
    if let Some(open) = before.rfind('[') {
        if !before[open..].contains(']') {
            if let Some(close) = after.find(']') {
                if after[close..].starts_with("](") {
                    return true;
                }
            }
        }
    }
    // Inside the destination of `[text](…)`.
    if let Some(open) = before.rfind("](") {
        if !before[open..].contains(')') && after.contains(')') {
            return true;
        }
    }
    false
}

/// Case-insensitive whole-word occurrences of `name` in `line` outside links: (start, end).
fn find_mentions(line: &str, name: &str) -> Vec<(usize, usize)> {
    let lower = line.to_lowercase();
    let needle = name.to_lowercase();
    if lower.len() != line.len() || needle.is_empty() {
        return Vec::new(); // case folding changed byte offsets: skip rather than guess
    }
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(i) = lower[from..].find(&needle) {
        let start = from + i;
        let end = start + needle.len();
        from = end;
        if !line.is_char_boundary(start) || !line.is_char_boundary(end) {
            continue;
        }
        let prev = line[..start].chars().next_back();
        let next = line[end..].chars().next();
        if prev.is_some_and(is_word_char) || next.is_some_and(is_word_char) {
            continue;
        }
        if in_link(line, start) {
            continue;
        }
        out.push((start, end));
    }
    out
}

/// Body lines (outside front matter and fenced code) as (1-based line, text).
fn body_lines(text: &str) -> Vec<(u32, &str)> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.lines().enumerate().peekable();
    if lines.peek().map(|(_, l)| l.trim_end()) == Some("---") {
        lines.next();
        for (_, l) in lines.by_ref() {
            let t = l.trim_end();
            if t == "---" || t == "..." {
                break;
            }
        }
    }
    let mut out = Vec::new();
    let mut fence: Option<char> = None;
    for (i, line) in lines {
        let t = line.trim_start();
        if let Some(c) = fence {
            if t.starts_with(&c.to_string().repeat(3)) {
                fence = None;
            }
            continue;
        }
        if t.starts_with("```") {
            fence = Some('`');
            continue;
        }
        if t.starts_with("~~~") {
            fence = Some('~');
            continue;
        }
        out.push((i as u32 + 1, line));
    }
    out
}

impl Index {
    fn section_above(&self, path: &str, line: u32) -> Option<String> {
        self.conn
            .query_row(
                "SELECT h.text FROM headings h JOIN notes n ON n.id = h.note WHERE n.path = ?1 AND h.line < ?2 ORDER BY h.line DESC LIMIT 1",
                params![path, line],
                |r| r.get(0),
            )
            .ok()
    }

    /// Names other notes might use for this note: stem, front-matter title, aliases.
    fn names_of(&self, path: &str) -> Result<Vec<String>> {
        let mut names = vec![file_stem(path).to_string()];
        let title: Option<String> = self
            .conn
            .query_row(
                "SELECT title FROM notes WHERE path = ?1",
                params![path],
                |r| r.get(0),
            )
            .ok();
        if let Some(t) = title {
            names.push(t);
        }
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT a.alias FROM aliases a JOIN notes n ON n.id = a.note WHERE n.path = ?1",
            )
            .map_err(sql_err)?;
        let aliases: Vec<String> = stmt
            .query_map(params![path], |r| r.get(0))
            .map_err(sql_err)?
            .flatten()
            .collect();
        names.extend(aliases);
        let mut seen = HashSet::new();
        names.retain(|n| n.trim().len() >= MIN_NAME_LEN && seen.insert(n.to_lowercase()));
        Ok(names)
    }

    /// Links in other notes that resolve to `path`, in path then line order.
    pub fn backlinks(&self, path: &str) -> Result<Vec<Backlink>> {
        let names = self.names_of(path)?;
        let stem = file_stem(path).to_lowercase();
        let mut stmt = self
            .conn
            .prepare(
                "SELECT n.path, n.title, l.target, l.kind, l.line FROM links l JOIN notes n ON n.id = l.note
                 WHERE n.path != ?1 ORDER BY n.path, l.line",
            )
            .map_err(sql_err)?;
        let rows: Vec<(String, String, String, String, u32)> = stmt
            .query_map(params![path], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(sql_err)?
            .flatten()
            .collect();
        let lower_names: Vec<String> = names.iter().map(|n| n.to_lowercase()).collect();
        let mut out = Vec::new();
        let mut cache: Option<(String, Vec<String>)> = None;
        for (source, title, target, kind, line) in rows {
            let t = target.to_lowercase();
            let t_stem = super::extract::link_key(&target);
            // Cheap pre-filter before the real resolution.
            if t_stem != stem && !lower_names.contains(&t) && !t.ends_with(&format!("/{stem}")) {
                continue;
            }
            if self.resolve(&source, &target, &kind)?.as_deref() != Some(path) {
                continue;
            }
            if cache.as_ref().map(|(p, _)| p.as_str()) != Some(source.as_str()) {
                let text = fs::read_to_string(self.root.join(&source)).unwrap_or_default();
                cache = Some((source.clone(), text.lines().map(str::to_string).collect()));
            }
            let context = cache
                .as_ref()
                .and_then(|(_, lines)| lines.get(line as usize - 1))
                .map(|l| l.trim().to_string())
                .unwrap_or_default();
            out.push(Backlink {
                section: self.section_above(&source, line),
                source,
                source_title: title,
                line,
                context,
                kind,
            });
        }
        Ok(out)
    }

    /// Plain-text occurrences of this note's names in other notes, outside links.
    pub fn unlinked_mentions(&self, path: &str) -> Result<Vec<Mention>> {
        let names = self.names_of(path)?;
        let mut candidates: Vec<(String, String)> = Vec::new();
        let mut seen = HashSet::new();
        for name in &names {
            let Some(q) = fts_query(&format!("\"{}\"", name.replace('"', ""))) else {
                continue;
            };
            let mut stmt = self
                .conn
                .prepare_cached(
                    "SELECT n.path, n.title FROM notes_fts f JOIN notes n ON n.id = f.rowid WHERE notes_fts MATCH ?1 AND n.path != ?2 ORDER BY n.path",
                )
                .map_err(sql_err)?;
            let rows = stmt
                .query_map(params![q, path], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(sql_err)?;
            for (p, t) in rows.flatten() {
                if seen.insert(p.clone()) {
                    candidates.push((p, t));
                }
            }
        }
        candidates.sort();
        let mut out = Vec::new();
        for (source, title) in candidates {
            let text = fs::read_to_string(self.root.join(&source)).unwrap_or_default();
            for (line_no, line) in body_lines(&text) {
                let mut hits: Vec<(usize, usize)> = Vec::new();
                for name in &names {
                    for span in find_mentions(line, name) {
                        if !hits.iter().any(|(s, e)| span.0 < *e && span.1 > *s) {
                            hits.push(span);
                        }
                    }
                }
                hits.sort();
                for (s, e) in hits {
                    out.push(Mention {
                        source: source.clone(),
                        source_title: title.clone(),
                        line: line_no,
                        context: line.trim().to_string(),
                        matched: line[s..e].to_string(),
                        section: self.section_above(&source, line_no),
                    });
                    if out.len() >= MENTION_LIMIT {
                        return Ok(out);
                    }
                }
            }
        }
        Ok(out)
    }
}

/// Turns the first unlinked occurrence of `matched` on `line` of `source` into a wiki link
/// to `target` (`[[target]]`, or `[[target|matched]]` when the text differs). Returns false
/// if the line no longer holds that text.
pub fn link_mention(
    root: &Path,
    source: &str,
    line: u32,
    matched: &str,
    target: &str,
) -> Result<bool> {
    let abs = root.join(source);
    let text = fs::read_to_string(&abs)?;
    let mut lines: Vec<String> = text.split('\n').map(str::to_string).collect();
    let Some(slot) = lines.get_mut(line as usize - 1) else {
        return Ok(false);
    };
    let body = slot.trim_end_matches('\r').to_string();
    let cr = slot.ends_with('\r');
    let Some(&(s, e)) = find_mentions(&body, matched).first() else {
        return Ok(false);
    };
    let original = &body[s..e];
    let link = if original == target {
        format!("[[{target}]]")
    } else {
        format!("[[{target}|{original}]]")
    };
    let mut next = body.clone();
    next.replace_range(s..e, &link);
    if cr {
        next.push('\r');
    }
    *slot = next;
    write_atomic(&abs, lines.join("\n").as_bytes())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folio::Folio;

    fn folio_with(notes: &[(&str, &str)]) -> (tempfile::TempDir, Index) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("T")).unwrap();
        for (path, text) in notes {
            let abs = dir.path().join(path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(abs, text).unwrap();
        }
        let idx = Index::open(&dir.path().join("idx.sqlite"), &folio).unwrap();
        idx.refresh(&mut |_, _| {}).unwrap();
        (dir, idx)
    }

    #[test]
    fn mention_scanner_respects_words_and_links() {
        assert_eq!(
            find_mentions("Methods and methods, methodsx", "methods"),
            vec![(0, 7), (12, 19)]
        );
        assert_eq!(
            find_mentions(
                "see [[Methods]] and [Methods](Methods.md) and Methods",
                "Methods"
            ),
            vec![(46, 53)]
        );
        assert!(
            find_mentions("`Methods` in code counts", "Methods").len() == 1,
            "code spans are the caller's job; lines in fences are skipped by body_lines"
        );
        assert_eq!(
            body_lines("---\nt: 1\n---\na\n```\nb\n```\nc\n"),
            vec![(4, "a"), (8, "c")]
        );
    }

    #[test]
    fn backlinks_resolve_and_carry_context() {
        let (_d, idx) = folio_with(&[
            (
                "Target.md",
                "---\ntitle: The Target\naliases: [tgt]\n---\n[[Self]]\n",
            ),
            (
                "A.md",
                "# Intro\ntext\n## Later\nSee [[Target]] and [[the target]] and [t](Target.md).\n",
            ),
            ("B.md", "[[tgt|alias link]] and [[Other]]\n"),
            ("Other.md", "nothing\n"),
        ]);
        let bl = idx.backlinks("Target.md").unwrap();
        let brief: Vec<(&str, u32, &str, Option<&str>)> = bl
            .iter()
            .map(|b| {
                (
                    b.source.as_str(),
                    b.line,
                    b.kind.as_str(),
                    b.section.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            brief,
            vec![
                ("A.md", 4, "wiki", Some("Later")),
                ("A.md", 4, "wiki", Some("Later")),
                ("A.md", 4, "md", Some("Later")),
                ("B.md", 1, "wiki", None),
            ]
        );
        assert_eq!(
            bl[0].context,
            "See [[Target]] and [[the target]] and [t](Target.md)."
        );
        assert_eq!(bl[0].source_title, "A");
        assert!(idx
            .backlinks("Other.md")
            .unwrap()
            .iter()
            .all(|b| b.source == "B.md"));
    }

    #[test]
    fn unlinked_mentions_find_names_outside_links_and_can_link_them() {
        let (dir, idx) = folio_with(&[
            ("Target.md", "---\naliases: [tgt]\n---\nx\n"),
            ("A.md", "Already [[Target]] here.\nPlain target mention and TGT too.\n```\ntarget in code\n```\n"),
            ("B.md", "targets are not it\n"),
        ]);
        let m = idx.unlinked_mentions("Target.md").unwrap();
        let brief: Vec<(&str, u32, &str)> = m
            .iter()
            .map(|x| (x.source.as_str(), x.line, x.matched.as_str()))
            .collect();
        assert_eq!(brief, vec![("A.md", 2, "target"), ("A.md", 2, "TGT")]);

        assert!(link_mention(dir.path(), "A.md", 2, "target", "Target").unwrap());
        let text = fs::read_to_string(dir.path().join("A.md")).unwrap();
        assert!(text.contains("Plain [[Target|target]] mention and TGT too."));
        assert!(!link_mention(dir.path(), "A.md", 2, "zzz", "Target").unwrap());
        idx.refresh(&mut |_, _| {}).unwrap();
        assert_eq!(idx.unlinked_mentions("Target.md").unwrap().len(), 1);
        assert_eq!(idx.backlinks("Target.md").unwrap().len(), 2);
    }
}
