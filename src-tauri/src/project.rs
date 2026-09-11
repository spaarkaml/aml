//! Projects (ADR-004, ADR-011): a folder with a `project.aml.yaml` manifest.
//!
//! The manifest holds only what the files cannot say for themselves — the order of the
//! Binder, what a compile leaves out, and the Project's own goal. Everything else about a
//! document (its synopsis, its label, its status, its own word target) is front matter in
//! that document, where it survives being read by anything but AML.
//!
//! Like `.aml/boundings.yaml` the file is synced, so it is written one item per line and
//! parsed by hand rather than through a general YAML library: the exact line shape is the
//! feature, because two devices that reorder different parts of a book then edit different
//! lines. Unlike that file, top-level keys this version does not understand are kept
//! verbatim — Stage 6's compile presets will live here, and an older AML must never silently
//! drop a newer one's settings (ADR-004).
//!
//! Nothing in the manifest is load-bearing. The Binder is reconciled against the folder on
//! every read: a note that arrived over Syncthing appears whether or not it is listed, and a
//! line naming a note that has gone is ignored. Reading a Project never writes to disk.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::boundings::{quote, unquote};
use crate::folio::{is_ignored_name, write_atomic, EntryKind, Folio, FolioError, Result};
use crate::front_matter;

pub const MANIFEST: &str = "project.aml.yaml";
const MAX_DEPTH: usize = 8;

const HEADER: &str =
    "# AML Project (ADR-004). One binder item per line: this file is synced, and\n\
# line-per-item keeps merges clean. Paths are relative to this folder. AML\n\
# rewrites the keys it knows in this shape and keeps the rest as they are.\n";

/// Front-matter keys a Binder item's card is written as. They are ordinary properties.
pub const SYNOPSIS_KEY: &str = "synopsis";
pub const LABEL_KEY: &str = "label";
pub const STATUS_KEY: &str = "status";

/// A Project folder as the Overview lists it, without reading its manifest.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    /// Notes anywhere under the Project folder.
    pub notes: u32,
}

/// What `project.aml.yaml` says, and nothing more.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Manifest {
    pub title: String,
    /// Words the whole Project is aiming at (ADR-011 puts a Project's goal here).
    pub target: Option<u32>,
    /// `YYYY-MM-DD`.
    pub deadline: Option<String>,
    /// Project-relative paths, in Binder order. A hint, not a census.
    pub binder: Vec<String>,
    /// Project-relative paths left out of a compile; a folder excludes everything under it.
    pub exclude: Vec<String>,
    /// Top-level blocks this version does not model, kept verbatim and written back.
    pub extra: Vec<String>,
}

/// One row of the Binder: a folder (a part) or a note (a document).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BinderItem {
    /// Folio-relative, for opening it.
    pub path: String,
    /// Project-relative, as the manifest names it.
    pub rel: String,
    pub name: String,
    pub kind: EntryKind,
    pub depth: u32,
    /// False when this item, or a part above it, is excluded from a compile.
    pub include: bool,
    pub words: u32,
    pub synopsis: String,
    pub label: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// Folio-relative path of the Project folder.
    pub path: String,
    /// The folder's name.
    pub name: String,
    /// The manifest's title, which defaults to the folder's name.
    pub title: String,
    pub target: Option<u32>,
    pub deadline: Option<String>,
    pub binder: Vec<BinderItem>,
}

/// Per-note facts the Binder shows, from the index (WP-5.1): words and the card's properties.
#[derive(Debug, Clone, Default)]
pub struct NoteCard {
    pub words: u32,
    pub synopsis: String,
    pub label: String,
    pub status: String,
}

/* ---------------- the manifest file ---------------- */

fn is_date(value: &str) -> bool {
    value.len() == 10
        && value.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        })
}

pub fn parse(text: &str) -> Manifest {
    let mut m = Manifest::default();
    let mut list: Option<bool> = None; // Some(true) = binder, Some(false) = exclude
    let mut extra = false;
    for line in text.lines() {
        let indented = line.starts_with([' ', '\t']);
        let trimmed = line.trim();
        if !indented {
            list = None;
            if trimmed.is_empty() {
                extra = false;
                continue;
            }
            if trimmed.starts_with('#') {
                if extra {
                    m.extra.push(line.to_string());
                }
                continue;
            }
            extra = false;
            let Some((key, value)) = trimmed.split_once(':') else {
                continue;
            };
            match key.trim() {
                "title" => m.title = unquote(value),
                "target" => m.target = unquote(value).parse::<u32>().ok().filter(|n| *n > 0),
                "deadline" => {
                    let v = unquote(value);
                    m.deadline = is_date(&v).then_some(v);
                }
                "binder" => list = Some(true),
                "exclude" => list = Some(false),
                _ => {
                    extra = true;
                    m.extra.push(line.to_string());
                }
            }
            continue;
        }
        if extra {
            m.extra.push(line.to_string());
            continue;
        }
        let Some(is_binder) = list else { continue };
        let Some(item) = trimmed.strip_prefix("- ") else {
            continue;
        };
        let item = tidy(&unquote(item));
        if item.is_empty() {
            continue;
        }
        let into = if is_binder {
            &mut m.binder
        } else {
            &mut m.exclude
        };
        if !into.contains(&item) {
            into.push(item);
        }
    }
    m
}

pub fn to_yaml(m: &Manifest) -> String {
    let mut out = String::from(HEADER);
    out.push_str(&format!("title: {}\n", quote(&m.title)));
    if let Some(target) = m.target {
        out.push_str(&format!("target: {target}\n"));
    }
    if let Some(deadline) = &m.deadline {
        out.push_str(&format!("deadline: {}\n", quote(deadline)));
    }
    out.push_str("binder:\n");
    for path in &m.binder {
        out.push_str(&format!("  - {}\n", quote(path)));
    }
    if !m.exclude.is_empty() {
        out.push_str("exclude:\n");
        for path in &m.exclude {
            out.push_str(&format!("  - {}\n", quote(path)));
        }
    }
    for line in &m.extra {
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// A Project-relative path as the manifest writes it: forward slashes, no `.` or `..`, no
/// leading or trailing slash. Empty when the path tries to leave the Project.
fn tidy(raw: &str) -> String {
    let normalised = raw.replace('\\', "/");
    let mut parts: Vec<&str> = Vec::new();
    for seg in normalised.split('/') {
        let seg = seg.trim();
        match seg {
            "" | "." => continue,
            ".." => return String::new(),
            _ => parts.push(seg),
        }
    }
    parts.join("/")
}

/* ---------------- the folder ---------------- */

#[derive(Debug)]
struct DiskNode {
    rel: String,
    name: String,
    kind: EntryKind,
    children: Vec<DiskNode>,
}

/// Folders and notes under `dir`. A Project's Binder is its documents; anything else in the
/// folder (the research PDFs, the images) belongs to the Research panel, not to the Binder.
fn walk(dir: &Path, prefix: &str, depth: usize) -> Vec<DiskNode> {
    if depth > MAX_DEPTH {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_name(&name) || name == MANIFEST {
            continue;
        }
        let path = entry.path();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if path.is_dir() {
            let children = walk(&path, &rel, depth + 1);
            out.push(DiskNode {
                rel,
                name,
                kind: EntryKind::Folder,
                children,
            });
        } else if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
        {
            out.push(DiskNode {
                rel,
                name,
                kind: EntryKind::Note,
                children: Vec::new(),
            });
        }
    }
    out
}

/// Sorts each level by the manifest's order. An item the manifest has never heard of sorts
/// after the ones it has, folders first and then by name — the Browser's own order, so a
/// note that arrived over sync lands where you would have looked for it.
fn order(nodes: &mut [DiskNode], index: &HashMap<&str, usize>) {
    nodes.sort_by_key(|n| {
        (
            index.get(n.rel.as_str()).copied().unwrap_or(usize::MAX),
            n.kind != EntryKind::Folder,
            n.name.to_lowercase(),
        )
    });
    for node in nodes.iter_mut() {
        order(&mut node.children, index);
    }
}

fn flatten(
    nodes: &[DiskNode],
    project: &str,
    depth: u32,
    excluded: bool,
    exclude: &[String],
    facts: &HashMap<String, NoteCard>,
    out: &mut Vec<BinderItem>,
) {
    for node in nodes {
        let include = !excluded && !exclude.contains(&node.rel);
        let path = format!("{project}/{}", node.rel);
        let card = facts.get(&path).cloned().unwrap_or_default();
        out.push(BinderItem {
            name: if node.kind == EntryKind::Note {
                node.name
                    .trim_end_matches(".md")
                    .trim_end_matches(".MD")
                    .to_string()
            } else {
                node.name.clone()
            },
            path,
            rel: node.rel.clone(),
            kind: node.kind,
            depth,
            include,
            words: card.words,
            synopsis: card.synopsis,
            label: card.label,
            status: card.status,
        });
        flatten(
            &node.children,
            project,
            depth + 1,
            !include,
            exclude,
            facts,
            out,
        );
    }
}

impl Folio {
    fn project_dir(&self, rel: &str) -> Result<std::path::PathBuf> {
        let abs = self.resolve(rel)?;
        if !abs.is_dir() {
            return Err(FolioError::NotFound(rel.to_string()));
        }
        Ok(abs)
    }

    pub fn manifest(&self, rel: &str) -> Result<Manifest> {
        let path = self.project_dir(rel)?.join(MANIFEST);
        let text = fs::read_to_string(&path).map_err(|_| FolioError::NotFound(rel.to_string()))?;
        let mut m = parse(&text);
        if m.title.trim().is_empty() {
            m.title = rel.rsplit('/').next().unwrap_or(rel).to_string();
        }
        Ok(m)
    }

    pub fn write_manifest(&self, rel: &str, m: &Manifest) -> Result<()> {
        let path = self.project_dir(rel)?.join(MANIFEST);
        write_atomic(&path, to_yaml(m).as_bytes())
    }

    /// The Project at `rel`, its Binder reconciled against the folder. `facts` comes from the
    /// index; a Folio still indexing simply shows zero words rather than failing.
    pub fn project(&self, rel: &str, facts: &HashMap<String, NoteCard>) -> Result<Project> {
        let dir = self.project_dir(rel)?;
        let m = self.manifest(rel)?;
        let mut nodes = walk(&dir, "", 0);
        let index: HashMap<&str, usize> = m
            .binder
            .iter()
            .enumerate()
            .map(|(i, p)| (p.as_str(), i))
            .collect();
        order(&mut nodes, &index);
        let mut binder = Vec::new();
        flatten(&nodes, rel, 0, false, &m.exclude, facts, &mut binder);
        Ok(Project {
            path: rel.to_string(),
            name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
            title: m.title,
            target: m.target,
            deadline: m.deadline,
            binder,
        })
    }

    /// Turns a folder into a Project, creating the folder if it is not there yet.
    pub fn create_project(&self, rel: &str, title: &str) -> Result<()> {
        let abs = self.resolve(rel)?;
        if abs.join(MANIFEST).exists() {
            return Err(FolioError::AlreadyExists(format!("{rel}/{MANIFEST}")));
        }
        fs::create_dir_all(&abs)?;
        let title = if title.trim().is_empty() {
            rel.rsplit('/').next().unwrap_or(rel).to_string()
        } else {
            title.trim().to_string()
        };
        // The Binder starts empty: what is in the folder already is reconciled in on the
        // first read, in the Browser's order.
        self.write_manifest(
            rel,
            &Manifest {
                title,
                ..Manifest::default()
            },
        )
    }

    /// Applies `f` to the manifest and writes it back.
    pub fn edit_manifest(&self, rel: &str, f: impl FnOnce(&mut Manifest)) -> Result<()> {
        let mut m = self.manifest(rel)?;
        f(&mut m);
        self.write_manifest(rel, &m)
    }

    /// Writes a card's properties onto the note itself and returns what it now says.
    pub fn write_card(
        &self,
        note_rel: &str,
        pairs: &[(&str, &str)],
    ) -> Result<(String, String, String)> {
        let note = self.read_note(note_rel)?;
        let text = front_matter::set_keys(&note.text, pairs);
        if text != note.text {
            self.write_note(note_rel, &text, None)?;
        }
        Ok((
            front_matter::get_key(&text, SYNOPSIS_KEY),
            front_matter::get_key(&text, LABEL_KEY),
            front_matter::get_key(&text, STATUS_KEY),
        ))
    }

    /// Every folder holding a `project.aml.yaml`, with the notes under it.
    pub fn projects(&self) -> Result<Vec<ProjectInfo>> {
        let mut out = Vec::new();
        collect_projects(self.root(), self.root(), 0, &mut out);
        out.sort_by_key(|p| p.name.to_lowercase());
        Ok(out)
    }
}

fn collect_projects(root: &Path, dir: &Path, depth: usize, out: &mut Vec<ProjectInfo>) {
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
        if is_ignored_name(&name) {
            continue;
        }
        if path.join(MANIFEST).is_file() {
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

fn count_notes(dir: &Path) -> u32 {
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

/// The Project folder holding `note`, if any — the innermost one, so a Project inside a
/// Project belongs to the nearer of the two.
pub fn project_of(projects: &[ProjectInfo], note: &str) -> Option<String> {
    projects
        .iter()
        .filter(|p| note.starts_with(&format!("{}/", p.path)))
        .max_by_key(|p| p.path.len())
        .map(|p| p.path.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Manifest {
        Manifest {
            title: "The Salt Road".into(),
            target: Some(90_000),
            deadline: Some("2026-12-01".into()),
            binder: vec![
                "part one".into(),
                "part one/01 Arrival.md".into(),
                "part one/02 The road.md".into(),
            ],
            exclude: vec!["part one/02 The road.md".into()],
            extra: Vec::new(),
        }
    }

    #[test]
    fn round_trips_one_item_per_line() {
        let text = to_yaml(&sample());
        assert_eq!(parse(&text), sample());
        // The merge-friendly shape is the point: every binder item is its own line.
        assert!(text.contains("\n  - \"part one/01 Arrival.md\"\n"));
        assert!(text.contains("\ntarget: 90000\n"));
    }

    #[test]
    fn keeps_keys_it_does_not_understand() {
        // Stage 6's compile presets will land here; an older AML must not silently drop them.
        let text = "title: Thesis\npresets:\n  - name: Examiner copy\n    format: pdf\nbinder:\n  - \"01.md\"\n";
        let m = parse(text);
        assert_eq!(m.title, "Thesis");
        assert_eq!(m.binder, ["01.md"]);
        assert_eq!(
            m.extra,
            ["presets:", "  - name: Examiner copy", "    format: pdf"]
        );
        let written = to_yaml(&m);
        assert!(written.contains("presets:\n  - name: Examiner copy\n    format: pdf\n"));
        assert_eq!(parse(&written), m);
    }

    #[test]
    fn reads_a_hand_written_manifest_and_refuses_nonsense() {
        let m = parse(
            "# mine\ntitle: \"Book\"\ntarget: nine thousand\ndeadline: soon\nbinder:\n  - ./one.md\n  - one.md\n  - \"../outside.md\"\n  -\nexclude:\n  - two.md\n",
        );
        assert_eq!(m.title, "Book");
        assert_eq!(m.target, None);
        assert_eq!(m.deadline, None);
        // `./one.md` tidies to the same item, which is listed once; `..` never gets in.
        assert_eq!(m.binder, ["one.md"]);
        assert_eq!(m.exclude, ["two.md"]);
    }

    fn folio_with_a_project() -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Writing")).unwrap();
        let root = folio.root().to_path_buf();
        fs::create_dir_all(root.join("The Salt Road/part one")).unwrap();
        fs::create_dir_all(root.join("The Salt Road/part two")).unwrap();
        fs::write(
            root.join("The Salt Road/part one/01 Arrival.md"),
            "---\nsynopsis: She reaches the flats\nstatus: drafting\n---\n\nWords here.\n",
        )
        .unwrap();
        fs::write(
            root.join("The Salt Road/part one/02 The road.md"),
            "# Two\n",
        )
        .unwrap();
        fs::write(root.join("The Salt Road/part two/03 Salt.md"), "# Three\n").unwrap();
        fs::write(root.join("The Salt Road/notes.pdf"), "not a note").unwrap();
        (dir, folio)
    }

    #[test]
    fn creating_a_project_reconciles_the_folder_that_is_already_there() {
        let (_dir, folio) = folio_with_a_project();
        folio.create_project("The Salt Road", "").unwrap();
        assert_eq!(
            folio.manifest("The Salt Road").unwrap().title,
            "The Salt Road"
        );

        let p = folio.project("The Salt Road", &HashMap::new()).unwrap();
        let rows: Vec<(&str, u32)> = p.binder.iter().map(|i| (i.rel.as_str(), i.depth)).collect();
        // Folders first, then by name, nested under their part — and the PDF is not a
        // Binder item.
        assert_eq!(
            rows,
            [
                ("part one", 0),
                ("part one/01 Arrival.md", 1),
                ("part one/02 The road.md", 1),
                ("part two", 0),
                ("part two/03 Salt.md", 1),
            ]
        );
        assert!(p.binder.iter().all(|i| i.include));
        assert_eq!(folio.projects().unwrap().len(), 1);
        assert_eq!(folio.projects().unwrap()[0].notes, 3);
    }

    #[test]
    fn the_manifests_order_wins_and_what_it_has_never_seen_follows() {
        let (_dir, folio) = folio_with_a_project();
        folio.create_project("The Salt Road", "").unwrap();
        folio
            .edit_manifest("The Salt Road", |m| {
                m.binder = vec![
                    "part two".into(),
                    "part two/03 Salt.md".into(),
                    "part one".into(),
                    "part one/02 The road.md".into(),
                ];
            })
            .unwrap();
        let p = folio.project("The Salt Road", &HashMap::new()).unwrap();
        let rows: Vec<&str> = p.binder.iter().map(|i| i.rel.as_str()).collect();
        assert_eq!(
            rows,
            [
                "part two",
                "part two/03 Salt.md",
                "part one",
                // Listed, so it comes before the one the manifest has never heard of.
                "part one/02 The road.md",
                "part one/01 Arrival.md",
            ]
        );
    }

    #[test]
    fn excluding_a_part_excludes_everything_under_it() {
        let (_dir, folio) = folio_with_a_project();
        folio.create_project("The Salt Road", "").unwrap();
        folio
            .edit_manifest("The Salt Road", |m| m.exclude.push("part one".into()))
            .unwrap();
        let p = folio.project("The Salt Road", &HashMap::new()).unwrap();
        let out: Vec<(&str, bool)> = p
            .binder
            .iter()
            .map(|i| (i.rel.as_str(), i.include))
            .collect();
        assert_eq!(
            out,
            [
                ("part one", false),
                ("part one/01 Arrival.md", false),
                ("part one/02 The road.md", false),
                ("part two", true),
                ("part two/03 Salt.md", true),
            ]
        );
    }

    #[test]
    fn a_manifest_line_for_a_note_that_has_gone_is_ignored_not_shown() {
        let (_dir, folio) = folio_with_a_project();
        folio.create_project("The Salt Road", "").unwrap();
        folio
            .edit_manifest("The Salt Road", |m| {
                m.binder = vec!["part one/99 Deleted.md".into(), "part one".into()];
            })
            .unwrap();
        let p = folio.project("The Salt Road", &HashMap::new()).unwrap();
        assert!(p.binder.iter().all(|i| i.rel != "part one/99 Deleted.md"));
        // …and the line survives in the file, because the note may simply not have synced yet.
        assert!(folio
            .manifest("The Salt Road")
            .unwrap()
            .binder
            .contains(&"part one/99 Deleted.md".to_string()));
    }

    #[test]
    fn a_card_is_written_to_the_note_not_to_the_manifest() {
        let (_dir, folio) = folio_with_a_project();
        folio.create_project("The Salt Road", "").unwrap();
        let note = "The Salt Road/part one/02 The road.md";
        let (synopsis, label, status) = folio
            .write_card(
                note,
                &[
                    (SYNOPSIS_KEY, "They walk east for three days."),
                    (LABEL_KEY, "Scene"),
                    (STATUS_KEY, "drafting"),
                ],
            )
            .unwrap();
        assert_eq!(synopsis, "They walk east for three days.");
        assert_eq!(label, "Scene");
        assert_eq!(status, "drafting");
        let text = folio.read_note(note).unwrap().text;
        assert!(text.starts_with("---\nsynopsis: They walk east for three days.\n"));
        assert!(text.ends_with("# Two\n"));
        // Nothing about the card is in the manifest.
        assert!(!to_yaml(&folio.manifest("The Salt Road").unwrap()).contains("Scene"));
    }

    #[test]
    fn facts_from_the_index_land_on_the_right_rows() {
        let (_dir, folio) = folio_with_a_project();
        folio.create_project("The Salt Road", "").unwrap();
        let facts = HashMap::from([(
            "The Salt Road/part one/01 Arrival.md".to_string(),
            NoteCard {
                words: 412,
                synopsis: "She reaches the flats".into(),
                label: String::new(),
                status: "drafting".into(),
            },
        )]);
        let p = folio.project("The Salt Road", &facts).unwrap();
        let item = p
            .binder
            .iter()
            .find(|i| i.rel == "part one/01 Arrival.md")
            .unwrap();
        assert_eq!(item.words, 412);
        assert_eq!(item.synopsis, "She reaches the flats");
        assert_eq!(item.name, "01 Arrival");
        assert_eq!(p.binder.iter().map(|i| i.words).sum::<u32>(), 412);
    }

    #[test]
    fn a_note_belongs_to_the_nearest_project_above_it() {
        let projects = vec![
            ProjectInfo {
                path: "Books".into(),
                name: "Books".into(),
                notes: 9,
            },
            ProjectInfo {
                path: "Books/The Salt Road".into(),
                name: "The Salt Road".into(),
                notes: 3,
            },
        ];
        assert_eq!(
            project_of(&projects, "Books/The Salt Road/01.md").as_deref(),
            Some("Books/The Salt Road")
        );
        assert_eq!(
            project_of(&projects, "Books/loose.md").as_deref(),
            Some("Books")
        );
        assert_eq!(project_of(&projects, "Inbox.md"), None);
    }
}
