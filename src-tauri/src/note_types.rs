//! Note Types (Q9): what a note *is* — chapter, character, source — declared in its own front
//! matter as `type:` and so still plain markdown that any other editor can read.
//!
//! A type has two halves, kept apart on purpose:
//!
//! - **What it means** lives in `_templates/`. The template that declares `type: chapter` is
//!   what makes a chapter, and the front-matter keys it carries are the properties a chapter
//!   has. That is the source of truth, it is a file you can edit, and it needs no registry.
//! - **What it looks like** lives in `.aml/types.yaml` — a colour and an icon, so the tree
//!   and the Properties panel can show at a glance what kind of note you are looking at.
//!
//! Which is why nothing is seeded. A type exists the moment a note or a template says it
//! does; the file below holds only the ones you have given a colour or a name of your own,
//! and an untouched Folio has no file at all. Like `boundings.yaml` it is synced, so it is
//! written one field per line: two devices that recolour different types edit different lines.

use std::collections::{BTreeMap, HashMap};
use std::fs;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::boundings::PALETTE;
use crate::folio::{write_atomic, Folio, Result};

pub const TYPES_FILE: &str = ".aml/types.yaml";
const HEADER: &str = "# AML note types (Q9). One field per line: this file is synced, and\n# line-per-field keeps merges clean. AML rewrites it in this shape.\n";

/// A type as the UI sees it: what the file says, filled in with what can be worked out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteType {
    /// Exactly what goes in `type:` — lower case, no spaces.
    pub id: String,
    pub name: String,
    /// `#rrggbb`. Deterministic from the id until someone chooses otherwise, so the same
    /// type is the same colour on both machines before either has an opinion.
    pub colour: String,
    /// An emoji, or empty for the plain coloured dot.
    pub icon: String,
    /// The template that makes one, when a template declares this type.
    pub template: Option<String>,
    /// Property keys that template carries, in its own order — the type's own fields.
    pub fields: Vec<String>,
    /// Notes carrying this type, from the index.
    pub notes: u32,
    /// True when `types.yaml` has an entry for it, rather than it being found in use.
    pub custom: bool,
}

/// The half of a type that is saved: everything else is worked out or counted.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct Saved {
    name: Option<String>,
    colour: Option<String>,
    icon: Option<String>,
}

/// A type id as it will be written into front matter: lower case, spaces to hyphens.
pub fn slug(raw: &str) -> String {
    let mut out = String::new();
    for c in raw.trim().chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
        } else if (c == '-' || c == '_' || c.is_whitespace()) && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

/// Title Case from an id, for a type nobody has named: `plot-thread` → `Plot Thread`.
pub fn name_from_id(id: &str) -> String {
    id.split(['-', '_'])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut cs = w.chars();
            match cs.next() {
                Some(c) => c.to_uppercase().collect::<String>() + cs.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The colour a type has before anyone chooses one. Deterministic from the id so the two
/// machines agree without the file having to travel first.
pub fn colour_for(id: &str) -> String {
    let hash = id
        .bytes()
        .fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
    PALETTE[(hash as usize) % PALETTE.len()].to_string()
}

/* ---------------- the file ---------------- */

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn unquote(s: &str) -> String {
    let t = s.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        t[1..t.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    } else {
        t.to_string()
    }
}

/// Reads the registry. Anything it does not recognise is dropped on the next write, which
/// the header says; an unreadable file is an empty registry rather than an error, because a
/// Folio with no types is the normal case.
fn parse(text: &str) -> BTreeMap<String, Saved> {
    let mut out: BTreeMap<String, Saved> = BTreeMap::new();
    let mut current: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("- id:") {
            let id = slug(&unquote(rest));
            current = (!id.is_empty()).then(|| {
                out.entry(id.clone()).or_default();
                id
            });
            continue;
        }
        let Some(id) = current.as_ref() else { continue };
        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        let value = unquote(value);
        let Some(entry) = out.get_mut(id) else {
            continue;
        };
        match key.trim() {
            "name" => entry.name = Some(value),
            "colour" => entry.colour = Some(value),
            "icon" => entry.icon = Some(value),
            _ => {}
        }
    }
    out
}

fn to_yaml(saved: &BTreeMap<String, Saved>) -> String {
    let mut out = String::from(HEADER);
    for (id, s) in saved {
        out.push_str(&format!("- id: {}\n", quote(id)));
        if let Some(v) = &s.name {
            out.push_str(&format!("  name: {}\n", quote(v)));
        }
        if let Some(v) = &s.colour {
            out.push_str(&format!("  colour: {}\n", quote(v)));
        }
        if let Some(v) = &s.icon {
            out.push_str(&format!("  icon: {}\n", quote(v)));
        }
    }
    out
}

/* ---------------- the Folio side ---------------- */

impl Folio {
    fn saved_types(&self) -> BTreeMap<String, Saved> {
        fs::read_to_string(self.root().join(TYPES_FILE))
            .map(|t| parse(&t))
            .unwrap_or_default()
    }

    fn write_saved_types(&self, saved: &BTreeMap<String, Saved>) -> Result<()> {
        let path = self.root().join(TYPES_FILE);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(&path, to_yaml(saved).as_bytes())
    }

    /// Every type this Folio knows about: saved, declared by a template, or simply in use.
    /// `counts` is `type id → notes`, which only the index can answer.
    pub fn note_types(&self, counts: &HashMap<String, u32>) -> Result<Vec<NoteType>> {
        let saved = self.saved_types();
        let templates = self.templates()?;

        // Every id from any of the three sources, so a type is never invisible.
        let mut ids: Vec<String> = saved.keys().cloned().collect();
        for t in &templates {
            if let Some(id) = t.note_type.as_deref().map(slug) {
                if !id.is_empty() && !ids.contains(&id) {
                    ids.push(id);
                }
            }
        }
        for id in counts.keys() {
            let id = slug(id);
            if !id.is_empty() && !ids.contains(&id) {
                ids.push(id);
            }
        }

        let mut out: Vec<NoteType> = ids
            .into_iter()
            .map(|id| {
                let s = saved.get(&id);
                let template = templates
                    .iter()
                    .find(|t| t.note_type.as_deref().map(slug).as_deref() == Some(&id));
                NoteType {
                    name: s
                        .and_then(|s| s.name.clone())
                        .unwrap_or_else(|| name_from_id(&id)),
                    colour: s
                        .and_then(|s| s.colour.clone())
                        .unwrap_or_else(|| colour_for(&id)),
                    icon: s.and_then(|s| s.icon.clone()).unwrap_or_default(),
                    template: template.map(|t| t.name.clone()),
                    fields: template
                        .map(|t| self.template_fields(&t.name))
                        .unwrap_or_default(),
                    notes: counts.get(&id).copied().unwrap_or(0),
                    custom: s.is_some(),
                    id,
                }
            })
            .collect();
        // Most used first, then alphabetically: the type you actually write in leads.
        out.sort_by(|a, b| b.notes.cmp(&a.notes).then_with(|| a.name.cmp(&b.name)));
        Ok(out)
    }

    /// The front-matter keys of a template, in its own order and without `type:` itself —
    /// the properties a note of that type is expected to carry.
    fn template_fields(&self, template: &str) -> Vec<String> {
        let Some(text) = self.template_text(template) else {
            return Vec::new();
        };
        crate::templates::front_matter_keys(&text)
            .into_iter()
            .filter(|k| k != "type")
            .collect()
    }

    /// Saves a type's colour, icon and name. An entry equal to what AML would work out
    /// anyway is removed rather than written, so the file stays the list of your decisions.
    pub fn write_note_type(&self, ty: &NoteType) -> Result<()> {
        let id = slug(&ty.id);
        if id.is_empty() {
            return Err(crate::folio::FolioError::InvalidPath(ty.id.clone()));
        }
        let mut saved = self.saved_types();
        let entry = Saved {
            name: (ty.name.trim() != name_from_id(&id) && !ty.name.trim().is_empty())
                .then(|| ty.name.trim().to_string()),
            colour: (ty.colour != colour_for(&id) && !ty.colour.is_empty())
                .then(|| ty.colour.clone()),
            icon: (!ty.icon.is_empty()).then(|| ty.icon.clone()),
        };
        if entry == Saved::default() {
            saved.remove(&id);
        } else {
            saved.insert(id, entry);
        }
        if saved.is_empty() {
            // Nothing left to remember: the Folio goes back to having no file at all.
            let _ = fs::remove_file(self.root().join(TYPES_FILE));
            return Ok(());
        }
        self.write_saved_types(&saved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn folio() -> (tempfile::TempDir, Folio) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Writing")).unwrap();
        (dir, folio)
    }

    #[test]
    fn ids_are_slugs_and_names_come_back_from_them() {
        assert_eq!(slug("Plot Thread"), "plot-thread");
        assert_eq!(slug("  Source__note "), "source-note");
        assert_eq!(slug("Chapter"), "chapter");
        assert_eq!(slug("!!!"), "");
        assert_eq!(name_from_id("plot-thread"), "Plot Thread");
        assert_eq!(name_from_id("chapter"), "Chapter");
    }

    #[test]
    fn a_types_colour_is_the_same_on_both_machines_before_anyone_chooses_one() {
        assert_eq!(colour_for("chapter"), colour_for("chapter"));
        assert!(PALETTE.contains(&colour_for("character").as_str()));
    }

    #[test]
    fn types_are_found_in_templates_and_in_use_without_any_file() {
        let (_dir, folio) = folio();
        fs::create_dir_all(folio.root().join("_templates")).unwrap();
        fs::write(
            folio.root().join("_templates/Chapter.md"),
            "---\ntype: chapter\nstatus: drafting\npov: \n---\n\n# {{title}}\n",
        )
        .unwrap();

        let counts = HashMap::from([("character".to_string(), 3), ("chapter".to_string(), 1)]);
        let types = folio.note_types(&counts).unwrap();
        assert_eq!(
            types.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            ["character", "chapter"]
        );

        let chapter = types.iter().find(|t| t.id == "chapter").unwrap();
        assert_eq!(chapter.name, "Chapter");
        assert_eq!(chapter.template.as_deref(), Some("Chapter"));
        // The template's own keys are the type's fields; `type` is not one of them.
        assert_eq!(chapter.fields, ["status", "pov"]);
        assert!(!chapter.custom);

        // A type nobody templated still exists, because notes say it does.
        let character = types.iter().find(|t| t.id == "character").unwrap();
        assert_eq!(character.notes, 3);
        assert_eq!(character.template, None);
        assert!(character.fields.is_empty());

        assert!(!folio.root().join(TYPES_FILE).exists());
    }

    #[test]
    fn saving_keeps_decisions_and_forgets_defaults() {
        let (_dir, folio) = folio();
        let mut ty = NoteType {
            id: "Chapter".into(),
            name: "Chapter".into(),
            colour: colour_for("chapter"),
            icon: String::new(),
            template: None,
            fields: Vec::new(),
            notes: 0,
            custom: false,
        };
        // Everything at its default: nothing to remember, so no file is written.
        folio.write_note_type(&ty).unwrap();
        assert!(!folio.root().join(TYPES_FILE).exists());

        ty.icon = "📖".into();
        ty.colour = "#7a5c9e".into();
        folio.write_note_type(&ty).unwrap();
        let text = fs::read_to_string(folio.root().join(TYPES_FILE)).unwrap();
        assert!(text.contains("- id: \"chapter\"\n"));
        assert!(text.contains("  colour: \"#7a5c9e\"\n"));
        assert!(text.contains("  icon: \"📖\"\n"));
        // The name is AML's own, so it is not written — only decisions are.
        assert!(!text.contains("name:"));

        let found = folio.note_types(&HashMap::new()).unwrap();
        let chapter = found.iter().find(|t| t.id == "chapter").unwrap();
        assert_eq!(chapter.colour, "#7a5c9e");
        assert_eq!(chapter.icon, "📖");
        assert!(chapter.custom);

        // Putting it all back to default takes the file with it.
        ty.icon = String::new();
        ty.colour = colour_for("chapter");
        folio.write_note_type(&ty).unwrap();
        assert!(!folio.root().join(TYPES_FILE).exists());
    }

    #[test]
    fn a_hand_written_file_is_read_and_rewritten_in_shape() {
        let (_dir, folio) = folio();
        fs::create_dir_all(folio.root().join(".aml")).unwrap();
        fs::write(
            folio.root().join(TYPES_FILE),
            "- id: source\n  name: Reading note\n  mystery: kept?\n- id: scene\n  icon: 🎬\n",
        )
        .unwrap();

        let types = folio.note_types(&HashMap::new()).unwrap();
        let source = types.iter().find(|t| t.id == "source").unwrap();
        assert_eq!(source.name, "Reading note");
        let scene = types.iter().find(|t| t.id == "scene").unwrap();
        assert_eq!(scene.icon, "🎬");

        // Writing rewrites the file in AML's shape; what it could not read is gone, and the
        // header says so.
        folio.write_note_type(scene).unwrap();
        let text = fs::read_to_string(folio.root().join(TYPES_FILE)).unwrap();
        assert!(!text.contains("mystery"));
        assert!(text.contains("name: \"Reading note\""));
        assert!(text.starts_with("# AML note types"));
    }
}
