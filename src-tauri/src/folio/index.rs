//! In-memory note index for Quick Open (ADR-006): title, front-matter aliases and headings
//! per note, cached by mtime so a refresh only re-reads files that changed.

use std::collections::HashMap;
use std::fs;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{EntryKind, Folio, Result, TreeNode};

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

#[derive(Default)]
pub struct NoteIndex {
    entries: HashMap<String, NoteIndexEntry>,
}

impl NoteIndex {
    /// Brings the index in line with the Folio: drops vanished notes, re-reads changed ones.
    pub fn refresh(&mut self, folio: &Folio) -> Result<Vec<NoteIndexEntry>> {
        let tree = folio.tree()?;
        let mut seen: HashMap<String, u64> = HashMap::new();
        collect_notes(&tree, &mut seen);
        self.entries.retain(|p, _| seen.contains_key(p));
        for (path, mtime) in seen {
            let fresh = !matches!(self.entries.get(&path), Some(e) if e.mtime == mtime);
            if fresh {
                let abs = folio.resolve(&path)?;
                let text = fs::read_to_string(&abs).unwrap_or_default();
                let (title, aliases, headings) = extract(&text);
                self.entries.insert(
                    path.clone(),
                    NoteIndexEntry {
                        title: title.unwrap_or_else(|| file_title(&path)),
                        path,
                        aliases,
                        headings,
                        mtime,
                    },
                );
            }
        }
        let mut out: Vec<NoteIndexEntry> = self.entries.values().cloned().collect();
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

fn collect_notes(nodes: &[TreeNode], out: &mut HashMap<String, u64>) {
    for n in nodes {
        match n.kind {
            EntryKind::Note => {
                out.insert(n.path.clone(), n.mtime);
            }
            EntryKind::Folder => collect_notes(&n.children, out),
            EntryKind::File => {}
        }
    }
}

fn file_title(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
        .to_string()
}

fn unquote(s: &str) -> String {
    let t = s.trim();
    let t = t
        .strip_prefix('"')
        .and_then(|x| x.strip_suffix('"'))
        .or_else(|| t.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')))
        .unwrap_or(t);
    t.trim().to_string()
}

/// Parses `title`, `aliases` (flow `[a, b]`, block `- a`, or a scalar; `alias:` too) from a
/// leading YAML block, and ATX headings outside fenced code. Deliberately line-based: the
/// index must never fail on odd YAML, it just finds less.
pub fn extract(text: &str) -> (Option<String>, Vec<String>, Vec<String>) {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.lines().peekable();
    let mut title = None;
    let mut aliases = Vec::new();
    let mut headings = Vec::new();

    if lines.peek().map(|l| l.trim_end()) == Some("---") {
        lines.next();
        let mut in_aliases = false;
        for line in lines.by_ref() {
            let t = line.trim_end();
            if t == "---" || t == "..." {
                break;
            }
            if in_aliases {
                if let Some(item) = t.trim_start().strip_prefix("- ") {
                    aliases.push(unquote(item));
                    continue;
                }
                in_aliases = false;
            }
            let Some((key, value)) = t.split_once(':') else {
                continue;
            };
            let key = key.trim();
            let value = value.trim();
            match key {
                "title" if !value.is_empty() => title = Some(unquote(value)),
                "aliases" | "alias" => {
                    if value.is_empty() {
                        in_aliases = true;
                    } else if let Some(inner) =
                        value.strip_prefix('[').and_then(|v| v.strip_suffix(']'))
                    {
                        aliases.extend(
                            inner
                                .split(',')
                                .map(unquote)
                                .filter(|a| !a.is_empty()),
                        );
                    } else {
                        aliases.push(unquote(value));
                    }
                }
                _ => {}
            }
        }
    }

    let mut fence: Option<char> = None;
    for line in lines {
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
        let hashes = t.chars().take_while(|c| *c == '#').count();
        if (1..=6).contains(&hashes) {
            let rest = &t[hashes..];
            if rest.starts_with(' ') || rest.starts_with('\t') {
                let h = rest.trim().trim_end_matches('#').trim();
                if !h.is_empty() {
                    headings.push(h.to_string());
                }
            }
        }
    }
    (title, aliases, headings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_aliases_and_headings() {
        let text = "---\ntitle: \"Influence networks\"\naliases: [nets, 'influence']\nstatus: drafting\n---\n\n# Influence networks\n\n```md\n# not a heading\n```\n\n## Three properties ##\n\n#tag is not a heading\n";
        let (title, aliases, headings) = extract(text);
        assert_eq!(title.as_deref(), Some("Influence networks"));
        assert_eq!(aliases, vec!["nets", "influence"]);
        assert_eq!(headings, vec!["Influence networks", "Three properties"]);
    }

    #[test]
    fn block_aliases_and_no_front_matter() {
        let (title, aliases, headings) = extract("---\naliases:\n  - one\n  - \"two\"\ntype: x\n---\n### Deep\n");
        assert_eq!(title, None);
        assert_eq!(aliases, vec!["one", "two"]);
        assert_eq!(headings, vec!["Deep"]);
        let (t, a, h) = extract("Plain text\n# Heading\n");
        assert!(t.is_none() && a.is_empty());
        assert_eq!(h, vec!["Heading"]);
    }

    #[test]
    fn index_refreshes_only_changed_notes() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), None).unwrap();
        folio.write_note("a.md", "# Alpha\n", None).unwrap();
        folio.write_note("sub/b.md", "---\ntitle: Bee\n---\n", None).unwrap();
        let mut index = NoteIndex::default();
        let first = index.refresh(&folio).unwrap();
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].title, "a");
        assert_eq!(first[0].headings, vec!["Alpha"]);
        assert_eq!(first[1].title, "Bee");
        std::fs::remove_file(dir.path().join("a.md")).unwrap();
        let second = index.refresh(&folio).unwrap();
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].path, "sub/b.md");
    }
}
