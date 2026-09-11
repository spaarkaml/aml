//! Tags (WP-2.4): which notes carry which tags. The hierarchy (`a/b/c`) and the counts are
//! derived in the UI from these pairs, so one query serves the panel, chips and search.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::{sql_err, Index};
use crate::folio::Result;

/// One (tag, note) pair; a note appears once per tag however often it uses it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    /// Lower-case, without `#`, nested with `/`.
    pub tag: String,
    pub path: String,
    pub title: String,
}

impl Index {
    /// Every distinct (tag, note) pair, ordered by tag then path.
    pub fn tags_list(&self) -> Result<Vec<TagEntry>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT DISTINCT t.tag, n.path, n.title FROM tags t JOIN notes n ON n.id = t.note ORDER BY t.tag, n.path",
            )
            .map_err(sql_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(TagEntry {
                    tag: r.get(0)?,
                    path: r.get(1)?,
                    title: r.get(2)?,
                })
            })
            .map_err(sql_err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(sql_err)
    }

    /// Notes carrying `tag` or any tag nested under it.
    pub fn tag_notes(&self, tag: &str) -> Result<Vec<String>> {
        let tag = tag.trim_start_matches('#').trim_matches('/').to_lowercase();
        let mut stmt = self
            .conn
            .prepare(
                "SELECT DISTINCT n.path FROM tags t JOIN notes n ON n.id = t.note WHERE t.tag = ?1 OR t.tag LIKE ?2 ESCAPE '\\' ORDER BY n.path",
            )
            .map_err(sql_err)?;
        let like = format!(
            "{}/%",
            tag.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        let rows = stmt
            .query_map(params![tag, like], |r| r.get::<_, String>(0))
            .map_err(sql_err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(sql_err)
    }
}

/* ---------------- note types (WP-3.3) ---------------- */

impl Index {
    /// `type` → how many notes declare it. The index is the only thing that knows, because
    /// the answer is a fact about every note's front matter, not about any file on its own.
    pub fn type_counts(&self) -> Result<std::collections::HashMap<String, u32>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT value, COUNT(DISTINCT note) FROM props WHERE key = 'type' GROUP BY value",
            )
            .map_err(sql_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    crate::note_types::slug(&r.get::<_, String>(0)?),
                    r.get::<_, i64>(1)? as u32,
                ))
            })
            .map_err(sql_err)?;
        let mut out: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for row in rows {
            let (id, n) = row.map_err(sql_err)?;
            if !id.is_empty() {
                *out.entry(id).or_default() += n;
            }
        }
        Ok(out)
    }

    /// Every note that declares a type, as `path → type id`.
    pub fn types_by_note(&self) -> Result<std::collections::HashMap<String, String>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT n.path, p.value FROM props p JOIN notes n ON n.id = p.note
                 WHERE p.key = 'type' ORDER BY n.path",
            )
            .map_err(sql_err)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(sql_err)?;
        let mut out = std::collections::HashMap::new();
        for row in rows {
            let (path, value) = row.map_err(sql_err)?;
            let id = crate::note_types::slug(&value);
            if !id.is_empty() {
                out.insert(path, id);
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folio::Folio;
    use std::fs;

    #[test]
    fn lists_pairs_once_and_finds_nested_notes() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("T")).unwrap();
        fs::write(
            dir.path().join("a.md"),
            "---\ntags: [Work, work/deep]\n---\n#work again #Work\n",
        )
        .unwrap();
        fs::write(dir.path().join("b.md"), "#work/deep/er and #solo\n").unwrap();
        fs::write(dir.path().join("c.md"), "#worker\n").unwrap();
        let idx = Index::open(&dir.path().join("i.sqlite"), &folio).unwrap();
        idx.refresh(&mut |_, _| {}).unwrap();
        let pairs: Vec<(String, String)> = idx
            .tags_list()
            .unwrap()
            .into_iter()
            .map(|e| (e.tag, e.path))
            .collect();
        assert_eq!(
            pairs,
            vec![
                ("solo".into(), "b.md".into()),
                ("work".into(), "a.md".into()),
                ("work/deep".into(), "a.md".into()),
                ("work/deep/er".into(), "b.md".into()),
                ("worker".into(), "c.md".into()),
            ]
        );
        assert_eq!(idx.tag_notes("#Work").unwrap(), vec!["a.md", "b.md"]);
        assert_eq!(idx.tag_notes("work/deep").unwrap(), vec!["a.md", "b.md"]);
        assert_eq!(idx.tag_notes("solo").unwrap(), vec!["b.md"]);
        assert!(idx.tag_notes("wor").unwrap().is_empty());
    }
}
