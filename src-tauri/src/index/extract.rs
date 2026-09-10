//! Pulls the indexable facts out of one note's markdown: front-matter properties, title and
//! aliases, headings, tags, links and the body text. Deliberately line-based and lenient:
//! the index must never fail on odd YAML or half-typed syntax, it just finds less.

/// One `[[wiki]]` or `[text](note.md)` reference found in a note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkFact {
    /// Target as written, trimmed (`Note`, `folder/Note`, `../Other.md`).
    pub target: String,
    /// Lower-case file stem of the target, for matching against `notes.stem`.
    pub key: String,
    pub heading: Option<String>,
    pub alias: Option<String>,
    /// `wiki`, `embed` or `md`.
    pub kind: &'static str,
    /// 1-based line in the file.
    pub line: u32,
    /// Byte range of the target text within its line (what a rename rewrites).
    pub span: (usize, usize),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeadingFact {
    pub level: u8,
    pub text: String,
    pub line: u32,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct NoteFacts {
    pub title: Option<String>,
    pub aliases: Vec<String>,
    pub headings: Vec<HeadingFact>,
    /// Lower-case tag names without `#`; `line` 0 means front matter.
    pub tags: Vec<(String, u32)>,
    pub links: Vec<LinkFact>,
    /// Front-matter scalars and list items, one row per value.
    pub props: Vec<(String, String)>,
    /// Everything after the front matter, for full-text search.
    pub body: String,
    /// Whitespace-separated tokens outside front matter and fenced code.
    pub words: u32,
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

fn flow_list(value: &str) -> Option<Vec<String>> {
    let inner = value.strip_prefix('[')?.strip_suffix(']')?;
    Some(
        inner
            .split(',')
            .map(unquote)
            .filter(|a| !a.is_empty())
            .collect(),
    )
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-' || c == '/'
}

fn normalise_tag(raw: &str) -> Option<String> {
    let t = raw.trim().trim_start_matches('#').trim_matches('/');
    if t.is_empty() || t.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if !t.chars().all(is_tag_char) {
        return None;
    }
    Some(t.to_lowercase())
}

/// Lower-case file stem of a link target: last path segment without `.md`.
pub fn link_key(target: &str) -> String {
    let last = target.rsplit('/').next().unwrap_or(target).trim();
    let stem = last
        .strip_suffix(".md")
        .or_else(|| last.strip_suffix(".MD"))
        .unwrap_or(last);
    stem.to_lowercase()
}

/// Replaces inline code spans with spaces so tags and links inside them are not seen.
fn blank_code_spans(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut in_code = false;
    for c in line.chars() {
        if c == '`' {
            in_code = !in_code;
            out.push(' ');
        } else if in_code {
            out.push(if c.is_whitespace() { c } else { ' ' });
        } else {
            out.push(c);
        }
    }
    out
}

fn scan_wiki_links(line: &str, line_no: u32, out: &mut Vec<LinkFact>) {
    let bytes = line.as_bytes();
    let mut i = 0;
    while let Some(start) = line[i..].find("[[") {
        let open = i + start;
        let Some(close_rel) = line[open + 2..].find("]]") else {
            break;
        };
        let close = open + 2 + close_rel;
        let inner = &line[open + 2..close];
        let embed = open > 0 && bytes[open - 1] == b'!';
        i = close + 2;
        if inner.is_empty() || inner.contains("[[") {
            continue;
        }
        let (rest, alias) = match inner.split_once('|') {
            Some((r, a)) => (r, Some(a.trim().to_string()).filter(|a| !a.is_empty())),
            None => (inner, None),
        };
        let (raw_target, heading) = match rest.split_once('#') {
            Some((t, h)) => (t, Some(h.trim().to_string()).filter(|h| !h.is_empty())),
            None => (rest, None),
        };
        let target = raw_target.trim();
        if target.is_empty() {
            continue;
        }
        let start = open + 2 + (raw_target.len() - raw_target.trim_start().len());
        out.push(LinkFact {
            target: target.to_string(),
            key: link_key(target),
            heading,
            alias,
            kind: if embed { "embed" } else { "wiki" },
            line: line_no,
            span: (start, start + target.len()),
        });
    }
}

fn scan_md_links(line: &str, line_no: u32, out: &mut Vec<LinkFact>) {
    let mut i = 0;
    while let Some(start) = line[i..].find("](") {
        let paren = i + start + 2;
        let Some(end_rel) = line[paren..].find(')') else {
            break;
        };
        let end = paren + end_rel;
        // Walk back to the matching `[` for the link text.
        let text_start = line[..paren - 2].rfind('[');
        i = end + 1;
        let Some(ts) = text_start else {
            continue;
        };
        if ts >= 2 && &line[ts - 2..ts] == "[[" {
            continue;
        }
        let text = line[ts + 1..paren - 2].trim();
        let dest = &line[paren..end];
        let lead = dest.len() - dest.trim_start().len();
        let raw_target = dest.trim();
        let target = raw_target
            .split_once(" \"")
            .map(|(t, _)| t)
            .unwrap_or(raw_target)
            .trim();
        let (target, heading) = match target.split_once('#') {
            Some((t, h)) => (t, Some(h.to_string()).filter(|h| !h.is_empty())),
            None => (target, None),
        };
        let lower = target.to_lowercase();
        if !lower.ends_with(".md") || lower.contains("://") || target.starts_with('/') {
            continue;
        }
        let start = paren + lead;
        let span = (start, start + target.len());
        let target = percent_decode(target);
        out.push(LinkFact {
            key: link_key(&target),
            target,
            heading: heading.map(|h| percent_decode(&h)),
            alias: Some(text.to_string()).filter(|t| !t.is_empty()),
            kind: "md",
            line: line_no,
            span,
        });
    }
}

fn percent_decode(s: &str) -> String {
    if !s.contains('%') {
        return s.to_string();
    }
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

fn scan_tags(line: &str, line_no: u32, out: &mut Vec<(String, u32)>) {
    let mut prev: Option<char> = None;
    let mut chars = line.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        if c == '#' && matches!(prev, None | Some(' ') | Some('\t') | Some('(')) {
            let rest = &line[i + 1..];
            let len: usize = rest
                .chars()
                .take_while(|c| is_tag_char(*c))
                .map(char::len_utf8)
                .sum();
            if len > 0 {
                if let Some(tag) = normalise_tag(&rest[..len]) {
                    out.push((tag, line_no));
                }
                for _ in 0..rest[..len].chars().count() {
                    chars.next();
                }
                prev = Some('x');
                continue;
            }
        }
        prev = Some(c);
    }
}

/// Encodes the characters a CommonMark link destination cannot hold bare.
pub fn percent_encode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            ' ' => out.push_str("%20"),
            '(' => out.push_str("%28"),
            ')' => out.push_str("%29"),
            '<' => out.push_str("%3C"),
            '>' => out.push_str("%3E"),
            _ => out.push(c),
        }
    }
    out
}

/// Extracts every fact the index stores from a note's text.
pub fn extract(text: &str) -> NoteFacts {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut facts = NoteFacts::default();
    let mut lines = text.lines().enumerate().peekable();

    if lines.peek().map(|(_, l)| l.trim_end()) == Some("---") {
        lines.next();
        let mut list_key: Option<String> = None;
        for (_, line) in lines.by_ref() {
            let t = line.trim_end();
            if t == "---" || t == "..." {
                break;
            }
            if let Some(key) = &list_key {
                if let Some(item) = t.trim_start().strip_prefix("- ") {
                    push_prop(&mut facts, key, &unquote(item));
                    continue;
                }
                list_key = None;
            }
            let Some((key, value)) = t.split_once(':') else {
                continue;
            };
            if t.starts_with(' ') || t.starts_with('\t') {
                continue; // nested mapping: not modelled
            }
            let key = key.trim().to_string();
            let value = value.trim();
            if value.is_empty() {
                list_key = Some(key);
            } else if let Some(items) = flow_list(value) {
                for item in items {
                    push_prop(&mut facts, &key, &item);
                }
            } else {
                push_prop(&mut facts, &key, &unquote(value));
            }
        }
    }

    let mut body = String::with_capacity(text.len());
    let mut fence: Option<char> = None;
    for (idx, line) in lines {
        let line_no = idx as u32 + 1;
        body.push_str(line);
        body.push('\n');
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
        facts.words += line.split_whitespace().count() as u32;
        let hashes = t.chars().take_while(|c| *c == '#').count();
        if (1..=6).contains(&hashes) {
            let rest = &t[hashes..];
            if rest.starts_with(' ') || rest.starts_with('\t') {
                let h = rest.trim().trim_end_matches('#').trim();
                if !h.is_empty() {
                    facts.headings.push(HeadingFact {
                        level: hashes as u8,
                        text: h.to_string(),
                        line: line_no,
                    });
                }
            }
        }
        let clean = blank_code_spans(line);
        scan_wiki_links(&clean, line_no, &mut facts.links);
        scan_md_links(&clean, line_no, &mut facts.links);
        scan_tags(&clean, line_no, &mut facts.tags);
    }
    facts.body = body;
    facts
}

fn push_prop(facts: &mut NoteFacts, key: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    match key {
        "title" if facts.title.is_none() => facts.title = Some(value.to_string()),
        "aliases" | "alias" => facts.aliases.push(value.to_string()),
        "tags" | "tag" => {
            if let Some(tag) = normalise_tag(value) {
                facts.tags.push((tag, 0));
            }
        }
        _ => {}
    }
    facts.props.push((key.to_string(), value.to_string()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_aliases_and_headings() {
        let text = "---\ntitle: \"Influence networks\"\naliases: [nets, 'influence']\nstatus: drafting\n---\n\n# Influence networks\n\n```md\n# not a heading\n```\n\n## Three properties ##\n\n#tag is not a heading\n";
        let f = extract(text);
        assert_eq!(f.title.as_deref(), Some("Influence networks"));
        assert_eq!(f.aliases, vec!["nets", "influence"]);
        let heads: Vec<(u8, &str, u32)> = f
            .headings
            .iter()
            .map(|h| (h.level, h.text.as_str(), h.line))
            .collect();
        assert_eq!(
            heads,
            vec![(1, "Influence networks", 7), (2, "Three properties", 13)]
        );
        assert!(f
            .props
            .contains(&("status".to_string(), "drafting".to_string())));
        assert_eq!(f.tags, vec![("tag".to_string(), 15)]);
        assert!(f.body.starts_with("\n# Influence networks"));
    }

    #[test]
    fn block_aliases_and_no_front_matter() {
        let f = extract("---\naliases:\n  - one\n  - \"two\"\ntype: x\n---\n### Deep\n");
        assert_eq!(f.title, None);
        assert_eq!(f.aliases, vec!["one", "two"]);
        assert_eq!(f.headings[0].text, "Deep");
        let g = extract("Plain text\n# Heading\n");
        assert!(g.title.is_none() && g.aliases.is_empty());
        assert_eq!(g.headings[0].text, "Heading");
        assert_eq!(g.words, 4);
    }

    #[test]
    #[allow(clippy::type_complexity)]
    fn links_wiki_embed_and_markdown() {
        let f = extract(
            "See [[04 Methods]] and [[Notes/Rid#Three|the rid note]] plus ![[pic.png|300]].\nAlso [read](../Other%20Note.md#Part \"t\") but not [web](https://x.y/a.md) nor `[[code]]`.\n",
        );
        let short: Vec<(&str, &str, Option<&str>, Option<&str>, &str, u32)> = f
            .links
            .iter()
            .map(|l| {
                (
                    l.target.as_str(),
                    l.key.as_str(),
                    l.heading.as_deref(),
                    l.alias.as_deref(),
                    l.kind,
                    l.line,
                )
            })
            .collect();
        assert_eq!(
            short,
            vec![
                ("04 Methods", "04 methods", None, None, "wiki", 1),
                (
                    "Notes/Rid",
                    "rid",
                    Some("Three"),
                    Some("the rid note"),
                    "wiki",
                    1
                ),
                ("pic.png", "pic.png", None, Some("300"), "embed", 1),
                (
                    "../Other Note.md",
                    "other note",
                    Some("Part"),
                    Some("read"),
                    "md",
                    2
                ),
            ]
        );
    }

    #[test]
    fn tags_inline_and_front_matter() {
        let f = extract(
            "---\ntags: [Research, ops/info]\ntag: solo\n---\n#thesis/ch3 text (#paren) not#this #2026 `#code` #trail/\n```\n#in-fence\n```\n",
        );
        assert_eq!(
            f.tags,
            vec![
                ("research".to_string(), 0),
                ("ops/info".to_string(), 0),
                ("solo".to_string(), 0),
                ("thesis/ch3".to_string(), 5),
                ("paren".to_string(), 5),
                ("trail".to_string(), 5),
            ]
        );
    }

    #[test]
    fn code_fences_hide_syntax_and_words() {
        let f = extract("one two\n```\n[[Hidden]] #hidden three\n```\n~~~\nfour\n~~~\n");
        assert!(f.links.is_empty() && f.tags.is_empty());
        assert_eq!(f.words, 2);
    }
}
