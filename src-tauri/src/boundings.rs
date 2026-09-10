//! Boundings (ADR-011): virtual, many-to-many groupings of notes, kept in
//! `.aml/boundings.yaml` inside the Folio so they travel with it.
//!
//! The file is written one note per line, because it is synced: two devices that each add a
//! note to the same Bounding produce edits on different lines, which every merge tool can
//! reconcile. That constraint is why this module writes its own small, strict YAML subset
//! rather than serialising a structure through a general YAML library — the exact line shape
//! is the feature. Anything the reader does not recognise is dropped on the next write, and
//! the file says so at the top.

use std::collections::HashMap;
use std::fs;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::folio::{write_atomic, Folio, FolioError, Result};

pub const BOUNDINGS_FILE: &str = ".aml/boundings.yaml";
const HEADER: &str = "# AML Boundings (ADR-011). One note per line: this file is synced, and\n# line-per-note keeps merges clean. AML rewrites it in this shape.\n";

/// The Bounding colours offered when one is created, in order (ADR-010 palette first).
pub const PALETTE: [&str; 6] = [
    "#006078", "#e37c78", "#82bac4", "#7a5c9e", "#4c8b5a", "#c08a2e",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Bounding {
    /// Stable slug; renaming the Bounding does not change it.
    pub id: String,
    pub name: String,
    /// `#rrggbb`.
    pub colour: String,
    /// One or two characters, usually an emoji.
    pub icon: String,
    /// Folio-relative note paths, in the order they were added.
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    /// Notes anywhere under the Project folder.
    pub notes: u32,
}

/* ---------------- the file ---------------- */

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn unquote(s: &str) -> String {
    let t = s.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        let mut out = String::with_capacity(t.len());
        let mut chars = t[1..t.len() - 1].chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                match chars.next() {
                    Some('n') => out.push('\n'),
                    Some(other) => out.push(other),
                    None => {}
                }
            } else {
                out.push(c);
            }
        }
        out
    } else {
        t.to_string()
    }
}

pub fn parse(text: &str) -> Vec<Bounding> {
    let mut out: Vec<Bounding> = Vec::new();
    let mut in_notes = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("- id:") {
            in_notes = false;
            let id = unquote(rest);
            if id.is_empty() {
                continue;
            }
            out.push(Bounding {
                id,
                name: String::new(),
                colour: PALETTE[out.len() % PALETTE.len()].to_string(),
                icon: String::new(),
                notes: Vec::new(),
            });
            continue;
        }
        let Some(current) = out.last_mut() else {
            continue;
        };
        if trimmed == "notes:" {
            in_notes = true;
        } else if let Some(path) = trimmed.strip_prefix("- ") {
            if in_notes {
                let path = unquote(path);
                if !path.is_empty() && !current.notes.contains(&path) {
                    current.notes.push(path);
                }
            }
        } else if let Some((key, value)) = trimmed.split_once(':') {
            in_notes = false;
            match key.trim() {
                "name" => current.name = unquote(value),
                "colour" => current.colour = unquote(value),
                "icon" => current.icon = unquote(value),
                _ => {}
            }
        }
    }
    for b in out.iter_mut() {
        if b.name.is_empty() {
            b.name = b.id.clone();
        }
    }
    out
}

pub fn to_yaml(list: &[Bounding]) -> String {
    let mut out = String::from(HEADER);
    for b in list {
        out.push_str(&format!("- id: {}\n", quote(&b.id)));
        out.push_str(&format!("  name: {}\n", quote(&b.name)));
        out.push_str(&format!("  colour: {}\n", quote(&b.colour)));
        out.push_str(&format!("  icon: {}\n", quote(&b.icon)));
        out.push_str("  notes:\n");
        for note in &b.notes {
            out.push_str(&format!("    - {}\n", quote(note)));
        }
    }
    out
}

/// A file-name-safe slug, unique among `taken`.
pub fn slug(name: &str, taken: &[String]) -> String {
    let base: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let base = if base.is_empty() {
        "bounding".to_string()
    } else {
        base
    };
    if !taken.contains(&base) {
        return base;
    }
    (2..)
        .map(|n| format!("{base}-{n}"))
        .find(|c| !taken.contains(c))
        .unwrap_or(base)
}

impl Folio {
    pub fn boundings(&self) -> Result<Vec<Bounding>> {
        let path = self.root().join(BOUNDINGS_FILE);
        Ok(fs::read_to_string(path)
            .map(|t| parse(&t))
            .unwrap_or_default())
    }

    pub fn write_boundings(&self, list: &[Bounding]) -> Result<()> {
        let path = self.root().join(BOUNDINGS_FILE);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(&path, to_yaml(list).as_bytes())
    }

    /// Applies `f` to the Bounding list and writes it back.
    pub fn edit_boundings(
        &self,
        f: impl FnOnce(&mut Vec<Bounding>) -> Result<()>,
    ) -> Result<Vec<Bounding>> {
        let mut list = self.boundings()?;
        f(&mut list)?;
        self.write_boundings(&list)?;
        Ok(list)
    }

    /// Every folder holding a `project.aml.yaml`, with the notes under it (WP-5.1 fills these
    /// in; the Overview lists whatever is there today).
    pub fn projects(&self) -> Result<Vec<ProjectInfo>> {
        let mut out = Vec::new();
        collect_projects(self.root(), self.root(), 0, &mut out);
        out.sort_by_key(|p| p.name.to_lowercase());
        Ok(out)
    }
}

fn collect_projects(
    root: &std::path::Path,
    dir: &std::path::Path,
    depth: usize,
    out: &mut Vec<ProjectInfo>,
) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if crate::folio::is_ignored_name(&name) {
            continue;
        }
        if path.join("project.aml.yaml").is_file() {
            out.push(ProjectInfo {
                path: path
                    .strip_prefix(root)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_default(),
                name,
                notes: count_notes(&path),
            });
        } else {
            collect_projects(root, &path, depth + 1, out);
        }
    }
}

fn count_notes(dir: &std::path::Path) -> u32 {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut n = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            n += count_notes(&path);
        } else if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
        {
            n += 1;
        }
    }
    n
}

/// note path -> the names of the Boundings holding it, for `bounding:` searches.
pub fn by_note(list: &[Bounding]) -> HashMap<String, Vec<String>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for b in list {
        for note in &b.notes {
            map.entry(note.clone()).or_default().push(b.name.clone());
        }
    }
    map
}

/// Follows a renamed or moved note so its Boundings survive (WP-2.2 renames call this).
pub fn remap(list: &mut [Bounding], from: &str, to: &str) -> usize {
    let mut changed = 0;
    for b in list.iter_mut() {
        for note in b.notes.iter_mut() {
            if note == from {
                *note = to.to_string();
                changed += 1;
            } else if let Some(rest) = note.strip_prefix(&format!("{from}/")) {
                *note = format!("{to}/{rest}");
                changed += 1;
            }
        }
    }
    changed
}

pub fn find<'a>(list: &'a mut [Bounding], id: &str) -> Result<&'a mut Bounding> {
    list.iter_mut()
        .find(|b| b.id == id)
        .ok_or_else(|| FolioError::NotFound(id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<Bounding> {
        vec![
            Bounding {
                id: "academic".into(),
                name: "Academic".into(),
                colour: "#006078".into(),
                icon: "🎓".into(),
                notes: vec!["Thesis/chapters/03 Influence networks.md".into()],
            },
            Bounding {
                id: "creative".into(),
                name: "Creative: \"the salt road\"".into(),
                colour: "#e37c78".into(),
                icon: "✒️".into(),
                notes: vec![],
            },
        ]
    }

    #[test]
    fn round_trips_and_keeps_one_note_per_line() {
        let text = to_yaml(&sample());
        assert_eq!(parse(&text), sample());
        // The merge-friendly shape is the point: every note is its own line.
        assert!(text.contains("\n    - \"Thesis/chapters/03 Influence networks.md\"\n"));
        // Quotes and colons in a name survive the round trip.
        assert!(text.contains(r#"name: "Creative: \"the salt road\"""#));
    }

    #[test]
    fn reads_a_hand_written_file_and_ignores_what_it_does_not_know() {
        let list = parse(
            "# a comment\n- id: work\n  name: Work\n  icon: 💼\n  mystery: dropped\n  notes:\n    - Inbox.md\n    - Inbox.md\n- id: bare\n",
        );
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Work");
        assert_eq!(list[0].icon, "💼");
        // Unquoted values are read as written, and a note is never listed twice.
        assert_eq!(list[0].notes, ["Inbox.md"]);
        // A Bounding with no name falls back to its id, and gets a colour from the palette.
        assert_eq!(list[1].name, "bare");
        assert_eq!(list[1].colour, PALETTE[1]);
    }

    #[test]
    fn slugs_are_safe_and_unique() {
        assert_eq!(slug("Academic", &[]), "academic");
        assert_eq!(slug("The Salt Road!", &[]), "the-salt-road");
        assert_eq!(slug("  ", &[]), "bounding");
        assert_eq!(slug("Work", &["work".to_string()]), "work-2");
        assert_eq!(
            slug("Work", &["work".to_string(), "work-2".to_string()]),
            "work-3"
        );
    }

    #[test]
    fn renaming_a_note_or_its_folder_keeps_it_in_its_boundings() {
        let mut list = sample();
        assert_eq!(remap(&mut list, "Thesis/chapters", "Thesis/parts"), 1);
        assert_eq!(list[0].notes, ["Thesis/parts/03 Influence networks.md"]);
        assert_eq!(
            remap(
                &mut list,
                "Thesis/parts/03 Influence networks.md",
                "Thesis/parts/03 Networks.md"
            ),
            1
        );
        assert_eq!(list[0].notes, ["Thesis/parts/03 Networks.md"]);
        assert_eq!(remap(&mut list, "nothing.md", "other.md"), 0);
    }

    #[test]
    fn writes_reads_and_lists_projects_in_a_folio() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Writing")).unwrap();
        assert!(folio.boundings().unwrap().is_empty());
        folio.write_boundings(&sample()).unwrap();
        assert_eq!(folio.boundings().unwrap(), sample());
        assert!(folio.root().join(BOUNDINGS_FILE).is_file());

        let map = by_note(&sample());
        assert_eq!(
            map["Thesis/chapters/03 Influence networks.md"],
            ["Academic"]
        );

        let root = folio.root();
        fs::create_dir_all(root.join("The Salt Road/part one")).unwrap();
        fs::write(
            root.join("The Salt Road/project.aml.yaml"),
            "title: The Salt Road\n",
        )
        .unwrap();
        fs::write(root.join("The Salt Road/one.md"), "#").unwrap();
        fs::write(root.join("The Salt Road/part one/two.md"), "#").unwrap();
        fs::create_dir_all(root.join("Thesis")).unwrap();
        fs::write(root.join("Thesis/loose.md"), "#").unwrap();

        let projects = folio.projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, "The Salt Road");
        assert_eq!(projects[0].notes, 2);
    }
}
