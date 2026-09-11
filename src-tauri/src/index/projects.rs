//! What the Binder needs to know about each note in a Project (WP-5.1): its word count and
//! the three properties a card shows. One query per Project rather than one per note, for
//! the same reason `types_by_note` exists — a hundred-scene book is a hundred round trips
//! otherwise.

use std::collections::HashMap;

use rusqlite::params;

use super::{sql_err, Index};
use crate::folio::Result;
use crate::project::{NoteCard, LABEL_KEY, STATUS_KEY, SYNOPSIS_KEY};

/// Escapes a path prefix for `LIKE`, so a folder with a `%` or `_` in its name still matches
/// only itself.
fn like_prefix(prefix: &str) -> String {
    format!(
        "{}/%",
        prefix
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    )
}

impl Index {
    /// Every note at or under `prefix`, as `path → card`.
    pub fn cards_under(&self, prefix: &str) -> Result<HashMap<String, NoteCard>> {
        let like = like_prefix(prefix);
        let mut out: HashMap<String, NoteCard> = HashMap::new();

        let mut stmt = self
            .conn
            .prepare("SELECT path, words FROM notes WHERE path LIKE ?1 ESCAPE '\\'")
            .map_err(sql_err)?;
        let rows = stmt
            .query_map(params![like], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as u32))
            })
            .map_err(sql_err)?;
        for row in rows {
            let (path, words) = row.map_err(sql_err)?;
            out.entry(path).or_default().words = words;
        }

        let mut stmt = self
            .conn
            .prepare(
                "SELECT n.path, p.key, p.value FROM props p JOIN notes n ON n.id = p.note
                 WHERE n.path LIKE ?1 ESCAPE '\\' AND p.key IN (?2, ?3, ?4)",
            )
            .map_err(sql_err)?;
        let rows = stmt
            .query_map(params![like, SYNOPSIS_KEY, LABEL_KEY, STATUS_KEY], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(sql_err)?;
        for row in rows {
            let (path, key, value) = row.map_err(sql_err)?;
            let card = out.entry(path).or_default();
            match key.as_str() {
                SYNOPSIS_KEY => card.synopsis = value,
                LABEL_KEY => card.label = value,
                STATUS_KEY => card.status = value,
                _ => {}
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_prefix_matches_the_folder_and_nothing_that_merely_starts_with_it() {
        assert_eq!(like_prefix("Books"), "Books/%");
        assert_eq!(like_prefix("Draft_1"), "Draft\\_1/%");
    }
}
