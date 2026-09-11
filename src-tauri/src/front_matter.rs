//! Editing a note's YAML front matter from Rust, line-wise.
//!
//! The Corkboard writes a synopsis, a label or a status onto a note that is not open in the
//! editor, so the change cannot go through the editor's document. It goes through here
//! instead, and the rule is that it touches one line: everything the user wrote — key order,
//! comments, quoting style, block scalars — is left exactly as it was. Reformatting someone's
//! front matter because they typed a synopsis would be a silent rewrite of their file.

/// A value that needs quoting to survive a round trip through YAML.
fn needs_quoting(value: &str) -> bool {
    value.is_empty()
        || value.trim() != value
        || value.contains(": ")
        || value.ends_with(':')
        || value.contains('#')
        || value.contains('\n')
        || value.starts_with([
            '"', '\'', '[', '{', '-', '*', '&', '!', '|', '>', '%', '@', '`',
        ])
        || matches!(
            value.to_lowercase().as_str(),
            "true" | "false" | "null" | "yes" | "no" | "on" | "off" | "~"
        )
}

fn emit(key: &str, value: &str) -> String {
    if needs_quoting(value) {
        format!(
            "{key}: \"{}\"",
            value
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
        )
    } else {
        format!("{key}: {value}")
    }
}

/// The front matter block and the body, or `None` when the note has no front matter.
fn split(text: &str) -> Option<(&str, &str)> {
    let rest = text.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;
    let after = &rest[end + 4..];
    let body = after
        .strip_prefix("\r\n")
        .or_else(|| after.strip_prefix('\n'));
    Some((&rest[..end], body.unwrap_or(after)))
}

/// True when `line` is the top-level `key:` line (not a nested one, not a list item).
fn is_key_line(line: &str, key: &str) -> bool {
    !line.starts_with(char::is_whitespace)
        && line
            .split_once(':')
            .is_some_and(|(k, _)| k.trim() == key && !k.trim_start().starts_with('-'))
}

/// Sets each `(key, value)` in the note's front matter: an empty value removes the key, and
/// a key that is not there yet is appended. Returns the whole note text.
pub fn set_keys(text: &str, pairs: &[(&str, &str)]) -> String {
    let (front, body) = match split(text) {
        Some(parts) => parts,
        // Nothing to set and nothing to set it in: leave the note alone rather than giving
        // it a front-matter block it never had.
        None if pairs.iter().all(|(_, v)| v.trim().is_empty()) => return text.to_string(),
        None => ("", text),
    };

    let mut lines: Vec<String> = front.lines().map(str::to_string).collect();
    for (key, value) in pairs {
        let value = value.trim();
        let at = lines.iter().position(|l| is_key_line(l, key));
        match (at, value.is_empty()) {
            (Some(i), true) => {
                lines.remove(i);
                // A removed key takes its indented continuation lines with it.
                while lines
                    .get(i)
                    .is_some_and(|l| l.starts_with(char::is_whitespace))
                {
                    lines.remove(i);
                }
            }
            (Some(i), false) => lines[i] = emit(key, value),
            (None, true) => {}
            (None, false) => lines.push(emit(key, value)),
        }
    }

    if lines.is_empty() {
        return body.to_string();
    }
    format!("---\n{}\n---\n{}", lines.join("\n"), body)
}

/// Reads one top-level key, unquoted. Empty when it is not set.
pub fn get_key(text: &str, key: &str) -> String {
    let Some((front, _)) = split(text) else {
        return String::new();
    };
    front
        .lines()
        .find(|l| is_key_line(l, key))
        .and_then(|l| l.split_once(':'))
        .map(|(_, v)| unquote(v))
        .unwrap_or_default()
}

/// Strips matching quotes and the escapes AML writes.
pub fn unquote(raw: &str) -> String {
    let t = raw.trim();
    if t.len() >= 2
        && ((t.starts_with('"') && t.ends_with('"')) || (t.starts_with('\'') && t.ends_with('\'')))
    {
        let inner = &t[1..t.len() - 1];
        if t.starts_with('\'') {
            return inner.replace("''", "'");
        }
        let mut out = String::with_capacity(inner.len());
        let mut chars = inner.chars();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sets_a_key_and_leaves_every_other_line_alone() {
        let note = "---\ntype: scene\n# what this is for\nstatus: drafting\naliases: [a, b]\n---\n\n# Arrival\n\nText.\n";
        let out = set_keys(note, &[("synopsis", "She reaches the salt flats at dusk.")]);
        assert!(out.starts_with("---\ntype: scene\n# what this is for\nstatus: drafting\naliases: [a, b]\nsynopsis: She reaches"));
        assert!(out.ends_with("---\n\n# Arrival\n\nText.\n"));
    }

    #[test]
    fn replaces_in_place_and_removes_with_an_empty_value() {
        let note = "---\nstatus: drafting\ntype: scene\n---\nBody\n";
        let out = set_keys(note, &[("status", "revised")]);
        assert_eq!(out, "---\nstatus: revised\ntype: scene\n---\nBody\n");
        let gone = set_keys(&out, &[("status", "  ")]);
        assert_eq!(gone, "---\ntype: scene\n---\nBody\n");
        // Removing the last key removes the block rather than leaving `---\n---`.
        assert_eq!(set_keys(&gone, &[("type", "")]), "Body\n");
    }

    #[test]
    fn creates_front_matter_only_when_there_is_something_to_put_in_it() {
        assert_eq!(set_keys("Body\n", &[("label", "")]), "Body\n");
        assert_eq!(
            set_keys("Body\n", &[("label", "Scene")]),
            "---\nlabel: Scene\n---\nBody\n"
        );
    }

    #[test]
    fn quotes_only_what_yaml_would_otherwise_misread() {
        assert_eq!(
            emit("synopsis", "A plain sentence"),
            "synopsis: A plain sentence"
        );
        assert_eq!(
            emit("synopsis", "Dusk: the flats"),
            "synopsis: \"Dusk: the flats\""
        );
        assert_eq!(emit("label", "no"), "label: \"no\"");
        // A quote inside a plain scalar is ordinary text to YAML, so it is left where it is;
        // only a value that *starts* with one would be read as a quoted scalar.
        assert_eq!(emit("synopsis", "say \"stop\""), "synopsis: say \"stop\"");
        assert_eq!(
            emit("synopsis", "\"Stop,\" she said"),
            "synopsis: \"\\\"Stop,\\\" she said\""
        );
        // What is quoted comes back unquoted.
        let note = set_keys("Body\n", &[("synopsis", "Dusk: the flats")]);
        assert_eq!(get_key(&note, "synopsis"), "Dusk: the flats");
    }

    #[test]
    fn a_nested_key_of_the_same_name_is_not_the_one_that_changes() {
        let note = "---\ncompile:\n  status: final\nstatus: drafting\n---\nBody\n";
        let out = set_keys(note, &[("status", "revised")]);
        assert_eq!(
            out,
            "---\ncompile:\n  status: final\nstatus: revised\n---\nBody\n"
        );
        assert_eq!(get_key(&out, "status"), "revised");
    }

    #[test]
    fn reads_quoted_values_of_either_kind() {
        let note = "---\na: \"one: two\"\nb: 'it''s'\nc: bare\n---\n";
        assert_eq!(get_key(note, "a"), "one: two");
        assert_eq!(get_key(note, "b"), "it's");
        assert_eq!(get_key(note, "c"), "bare");
        assert_eq!(get_key(note, "d"), "");
    }
}
