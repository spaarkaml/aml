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
