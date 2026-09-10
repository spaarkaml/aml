//! Search query language (WP-2.5, ADR-007):
//!   words            all must match (prefix, case-insensitive, at a word start)
//!   "exact phrase"   as written, case-insensitive
//!   /regex/          case-insensitive regular expression (the `regex` crate, linear time)
//!   -term            exclude;  a OR b  either;  ( … )  grouping;  AND is implicit
//!   path: file: title: tag: has: bounding: <prop>:   fields (`type:` and `status:` are
//!                    front-matter properties like any other key)
//! Parsed and evaluated here so the panel, the palette and later Boundings share one rule.

use std::collections::HashMap;
use std::fs;

use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::{sql_err, Index};
use crate::folio::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Term {
    Word(String),
    Phrase(String),
    Regex(String),
    Field(String, String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    And(Vec<Expr>),
    Or(Vec<Expr>),
    Not(Box<Expr>),
    Term(Term),
    /// An empty query: matches nothing.
    Empty,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchSnippet {
    pub line: u32,
    /// The line with matches wrapped in `«»`.
    pub text: String,
    pub section: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    /// Matching occurrences of the text terms (0 for field-only queries).
    pub matches: u32,
    pub snippets: Vec<SearchSnippet>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: u32,
    /// Set when the query could not be parsed (bad regex, …); results are then empty.
    pub error: Option<String>,
}

const MAX_SNIPPETS: usize = 3;

// ---------------------------------------------------------------- tokens

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Open,
    Close,
    Neg,
    Or,
    Term(Term),
}

fn read_quoted(chars: &[char], mut i: usize) -> (String, usize) {
    // chars[i] == '"'
    i += 1;
    let mut s = String::new();
    while i < chars.len() && chars[i] != '"' {
        s.push(chars[i]);
        i += 1;
    }
    (s, (i + 1).min(chars.len()))
}

fn tokenize(q: &str) -> Vec<Tok> {
    let chars: Vec<char> = q.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        match c {
            '(' => {
                out.push(Tok::Open);
                i += 1;
            }
            ')' => {
                out.push(Tok::Close);
                i += 1;
            }
            '-' => {
                // `-term` negates; a lone `-` means nothing.
                if i + 1 < chars.len() && !chars[i + 1].is_whitespace() {
                    out.push(Tok::Neg);
                }
                i += 1;
            }
            '"' => {
                let (s, next) = read_quoted(&chars, i);
                i = next;
                if !s.trim().is_empty() {
                    out.push(Tok::Term(Term::Phrase(s)));
                }
            }
            '/' => {
                // Regex runs to the next unescaped '/'; without one it is a plain word.
                let mut j = i + 1;
                let mut s = String::new();
                let mut closed = false;
                while j < chars.len() {
                    if chars[j] == '\\' && j + 1 < chars.len() {
                        s.push(chars[j]);
                        s.push(chars[j + 1]);
                        j += 2;
                        continue;
                    }
                    if chars[j] == '/' {
                        closed = true;
                        break;
                    }
                    s.push(chars[j]);
                    j += 1;
                }
                if closed && !s.is_empty() {
                    out.push(Tok::Term(Term::Regex(s)));
                    i = j + 1;
                    // Skip trailing flag letters (`/x/i`): case-insensitive is the default.
                    while i < chars.len() && chars[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                } else {
                    let (w, next) = read_word(&chars, i);
                    out.push(Tok::Term(Term::Word(w)));
                    i = next;
                }
            }
            _ => {
                let (w, next) = read_word(&chars, i);
                i = next;
                if w.eq_ignore_ascii_case("or") {
                    out.push(Tok::Or);
                } else if w.eq_ignore_ascii_case("and") {
                    // implicit
                } else if let Some((key, value)) = split_field(&w) {
                    if value == "\"" || value.is_empty() && i < chars.len() && chars[i] == '"' {
                        // `key:"quoted value"` — the word reader stopped at the quote.
                        let (s, next) = read_quoted(&chars, i);
                        i = next;
                        out.push(Tok::Term(Term::Field(key, s)));
                    } else {
                        out.push(Tok::Term(Term::Field(key, value)));
                    }
                } else {
                    out.push(Tok::Term(Term::Word(w)));
                }
            }
        }
    }
    out
}

fn read_word(chars: &[char], mut i: usize) -> (String, usize) {
    let mut s = String::new();
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() || c == '(' || c == ')' {
            break;
        }
        if c == '"' {
            // `key:"…"` hands over to the quoted reader; a quote elsewhere ends the word.
            break;
        }
        s.push(c);
        i += 1;
    }
    (s, i)
}

/// `key:value` where the key is a short identifier; `http://…` and `12:30` are not fields.
fn split_field(w: &str) -> Option<(String, String)> {
    let (k, v) = w.split_once(':')?;
    if k.is_empty() || k.len() > 24 || !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return None;
    }
    if k.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if v.starts_with("//") {
        return None;
    }
    Some((k.to_lowercase(), v.to_string()))
}

// ---------------------------------------------------------------- parser

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }
    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }

    fn or_expr(&mut self) -> Expr {
        let mut branches = vec![self.and_expr()];
        while self.peek() == Some(&Tok::Or) {
            self.next();
            branches.push(self.and_expr());
        }
        let branches: Vec<Expr> = branches.into_iter().filter(|e| *e != Expr::Empty).collect();
        match branches.len() {
            0 => Expr::Empty,
            1 => branches.into_iter().next().unwrap_or(Expr::Empty),
            _ => Expr::Or(branches),
        }
    }

    fn and_expr(&mut self) -> Expr {
        let mut parts = Vec::new();
        while let Some(t) = self.peek() {
            match t {
                Tok::Or | Tok::Close => break,
                _ => {
                    let e = self.unary();
                    if e != Expr::Empty {
                        parts.push(e);
                    }
                }
            }
        }
        match parts.len() {
            0 => Expr::Empty,
            1 => parts.into_iter().next().unwrap_or(Expr::Empty),
            _ => Expr::And(parts),
        }
    }

    fn unary(&mut self) -> Expr {
        match self.next() {
            Some(Tok::Neg) => {
                let inner = self.unary();
                if inner == Expr::Empty {
                    Expr::Empty
                } else {
                    Expr::Not(Box::new(inner))
                }
            }
            Some(Tok::Open) => {
                let inner = self.or_expr();
                if self.peek() == Some(&Tok::Close) {
                    self.next();
                }
                inner
            }
            Some(Tok::Term(t)) => Expr::Term(t),
            // A stray `)` or `OR` here: skip it.
            Some(Tok::Close) | Some(Tok::Or) => Expr::Empty,
            None => Expr::Empty,
        }
    }
}

/// Parses a query. Never fails on shape (unbalanced parens, dangling operators are
/// tolerated); only a regex that does not compile is an error.
pub fn parse(query: &str) -> std::result::Result<Expr, String> {
    let toks = tokenize(query);
    let mut p = Parser { toks, pos: 0 };
    let mut expr = p.or_expr();
    // Anything after an unbalanced `)` is treated as more AND terms.
    while p.peek().is_some() {
        let rest = p.or_expr();
        if p.peek() == Some(&Tok::Close) {
            p.next();
        }
        expr = match (expr, rest) {
            (Expr::Empty, r) => r,
            (e, Expr::Empty) => e,
            (Expr::And(mut v), r) => {
                v.push(r);
                Expr::And(v)
            }
            (e, r) => Expr::And(vec![e, r]),
        };
    }
    validate(&expr)?;
    Ok(expr)
}

fn validate(expr: &Expr) -> std::result::Result<(), String> {
    match expr {
        Expr::Term(Term::Regex(r)) => Regex::new(&format!("(?i){r}"))
            .map(|_| ())
            .map_err(|e| format!("Bad regular expression /{r}/: {e}")),
        Expr::And(v) | Expr::Or(v) => v.iter().try_for_each(validate),
        Expr::Not(e) => validate(e),
        _ => Ok(()),
    }
}

// ---------------------------------------------------------------- evaluation

struct Doc<'a> {
    path: &'a str,
    title: &'a str,
    text: &'a str,
    lower: String,
    tags: &'a [String],
    props: &'a [(String, String)],
    /// Names of the Boundings holding this note (WP-2.8).
    boundings: &'a [String],
}

fn word_at_boundary(lower: &str, needle: &str) -> bool {
    let mut from = 0;
    while let Some(i) = lower[from..].find(needle) {
        let at = from + i;
        let prev = lower[..at].chars().next_back();
        if !prev.is_some_and(|c| c.is_alphanumeric()) {
            return true;
        }
        from = at + needle.len().max(1);
    }
    false
}

struct Cx {
    regex: HashMap<String, Regex>,
}

impl Cx {
    fn regex(&mut self, r: &str) -> Option<&Regex> {
        if !self.regex.contains_key(r) {
            let re = Regex::new(&format!("(?i){r}")).ok()?;
            self.regex.insert(r.to_string(), re);
        }
        self.regex.get(r)
    }
}

fn term_matches(t: &Term, d: &Doc, cx: &mut Cx) -> bool {
    match t {
        Term::Word(w) => {
            let n = w.to_lowercase();
            word_at_boundary(&d.lower, &n) || word_at_boundary(&d.title.to_lowercase(), &n)
        }
        Term::Phrase(p) => {
            let n = p.to_lowercase();
            d.lower.contains(&n) || d.title.to_lowercase().contains(&n)
        }
        Term::Regex(r) => cx.regex(r).is_some_and(|re| re.is_match(d.text)),
        Term::Field(k, v) => {
            let v = v.to_lowercase();
            match k.as_str() {
                "path" => d.path.to_lowercase().contains(&v),
                "file" => d
                    .path
                    .rsplit('/')
                    .next()
                    .unwrap_or(d.path)
                    .to_lowercase()
                    .contains(&v),
                "title" => d.title.to_lowercase().contains(&v),
                "tag" => {
                    let v = v.trim_start_matches('#').trim_matches('/');
                    d.tags
                        .iter()
                        .any(|t| t == v || t.starts_with(&format!("{v}/")))
                }
                "has" => match v.as_str() {
                    "image" => d.text.contains("![") || d.text.contains("![["),
                    "link" => d.text.contains("[[") || d.text.contains("]("),
                    "task" => d.text.contains("- [ ]") || d.text.contains("- [x]"),
                    "code" => d.text.contains("```") || d.text.contains("~~~"),
                    "table" => d.text.lines().any(|l| l.trim_start().starts_with('|')),
                    _ => false,
                },
                "bounding" => d.boundings.iter().any(|b| b.to_lowercase() == v),
                key => d
                    .props
                    .iter()
                    .any(|(pk, pv)| pk == key && (pv == &v || (v.is_empty() && !pv.is_empty()))),
            }
        }
    }
}

fn eval(e: &Expr, d: &Doc, cx: &mut Cx) -> bool {
    match e {
        Expr::And(v) => v.iter().all(|x| eval(x, d, cx)),
        Expr::Or(v) => v.iter().any(|x| eval(x, d, cx)),
        Expr::Not(x) => !eval(x, d, cx),
        Expr::Term(t) => term_matches(t, d, cx),
        Expr::Empty => false,
    }
}

/// Text terms that are required at the top level (for the FTS pre-filter and snippets).
fn required_text_terms(e: &Expr, out: &mut Vec<Term>) {
    match e {
        Expr::And(v) => v.iter().for_each(|x| required_text_terms(x, out)),
        Expr::Term(t @ (Term::Word(_) | Term::Phrase(_))) => out.push(t.clone()),
        _ => {}
    }
}

/// Every positive text term anywhere in the query (for highlighting).
fn positive_text_terms(e: &Expr, out: &mut Vec<Term>) {
    match e {
        Expr::And(v) | Expr::Or(v) => v.iter().for_each(|x| positive_text_terms(x, out)),
        Expr::Term(t @ (Term::Word(_) | Term::Phrase(_) | Term::Regex(_))) => out.push(t.clone()),
        _ => {}
    }
}

fn spans_in_line(line: &str, terms: &[Term], cx: &mut Cx) -> Vec<(usize, usize)> {
    let lower = line.to_lowercase();
    let same_len = lower.len() == line.len();
    let mut spans = Vec::new();
    for t in terms {
        match t {
            Term::Word(w) | Term::Phrase(w) if same_len => {
                let n = w.to_lowercase();
                if n.is_empty() {
                    continue;
                }
                let mut from = 0;
                while let Some(i) = lower[from..].find(&n) {
                    let at = from + i;
                    let boundary_ok = matches!(t, Term::Phrase(_))
                        || !lower[..at]
                            .chars()
                            .next_back()
                            .is_some_and(|c| c.is_alphanumeric());
                    let mut end = at + n.len();
                    if matches!(t, Term::Word(_)) {
                        // A word matches by prefix; mark the whole word it starts.
                        end += lower[end..]
                            .chars()
                            .take_while(|c| c.is_alphanumeric())
                            .map(char::len_utf8)
                            .sum::<usize>();
                    }
                    if boundary_ok && line.is_char_boundary(at) && line.is_char_boundary(end) {
                        spans.push((at, end));
                    }
                    from = at + n.len();
                }
            }
            Term::Regex(r) => {
                if let Some(re) = cx.regex(r) {
                    for m in re.find_iter(line) {
                        if m.end() > m.start() {
                            spans.push((m.start(), m.end()));
                        }
                    }
                }
            }
            _ => {}
        }
    }
    spans.sort();
    spans.dedup();
    // Drop overlaps so the markers nest cleanly.
    let mut out: Vec<(usize, usize)> = Vec::new();
    for (s, e) in spans {
        if let Some(last) = out.last_mut() {
            if s < last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        out.push((s, e));
    }
    out
}

fn mark(line: &str, spans: &[(usize, usize)]) -> String {
    let mut out = String::with_capacity(line.len() + spans.len() * 4);
    let mut cursor = 0;
    for &(s, e) in spans {
        out.push_str(&line[cursor..s]);
        out.push('«');
        out.push_str(&line[s..e]);
        out.push('»');
        cursor = e;
    }
    out.push_str(&line[cursor..]);
    out.trim().to_string()
}

fn snippets_for(text: &str, terms: &[Term], cx: &mut Cx) -> (u32, Vec<SearchSnippet>) {
    let mut total = 0;
    let mut out = Vec::new();
    let mut section: Option<String> = None;
    let mut fence: Option<char> = None;
    for (i, line) in text.lines().enumerate() {
        let t = line.trim_start();
        if let Some(c) = fence {
            if t.starts_with(&c.to_string().repeat(3)) {
                fence = None;
            }
        } else if t.starts_with("```") {
            fence = Some('`');
        } else if t.starts_with("~~~") {
            fence = Some('~');
        } else {
            let hashes = t.chars().take_while(|c| *c == '#').count();
            if (1..=6).contains(&hashes) && t[hashes..].starts_with(' ') {
                section = Some(t[hashes..].trim().trim_end_matches('#').trim().to_string());
            }
        }
        if terms.is_empty() {
            if out.is_empty() && !t.is_empty() && !t.starts_with("---") {
                out.push(SearchSnippet {
                    line: i as u32 + 1,
                    text: line.trim().to_string(),
                    section: section.clone(),
                });
            }
            continue;
        }
        let spans = spans_in_line(line, terms, cx);
        if spans.is_empty() {
            continue;
        }
        total += spans.len() as u32;
        if out.len() < MAX_SNIPPETS {
            out.push(SearchSnippet {
                line: i as u32 + 1,
                text: mark(line, &spans),
                section: section.clone(),
            });
        }
    }
    (total, out)
}

impl Index {
    fn all_tags(&self) -> Result<HashMap<String, Vec<String>>> {
        let mut stmt = self
            .conn
            .prepare("SELECT n.path, t.tag FROM tags t JOIN notes n ON n.id = t.note")
            .map_err(sql_err)?;
        let mut map: HashMap<String, Vec<String>> = HashMap::new();
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(sql_err)?;
        for (p, t) in rows.flatten() {
            map.entry(p).or_default().push(t);
        }
        Ok(map)
    }

    fn all_props(&self) -> Result<HashMap<String, Vec<(String, String)>>> {
        let mut stmt = self
            .conn
            .prepare("SELECT n.path, p.key, p.value FROM props p JOIN notes n ON n.id = p.note")
            .map_err(sql_err)?;
        let mut map: HashMap<String, Vec<(String, String)>> = HashMap::new();
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(sql_err)?;
        for (p, k, v) in rows.flatten() {
            map.entry(p)
                .or_default()
                .push((k.to_lowercase(), v.to_lowercase()));
        }
        Ok(map)
    }

    /// Runs a query-language search; `limit` caps the results, `total` counts all hits.
    pub fn search_query(&self, query: &str, limit: usize) -> Result<SearchResponse> {
        let expr = match parse(query) {
            Ok(e) => e,
            Err(error) => {
                return Ok(SearchResponse {
                    results: Vec::new(),
                    total: 0,
                    error: Some(error),
                })
            }
        };
        if expr == Expr::Empty {
            return Ok(SearchResponse {
                results: Vec::new(),
                total: 0,
                error: None,
            });
        }
        let mut required = Vec::new();
        required_text_terms(&expr, &mut required);
        let candidates: Vec<(String, String)> = if required.is_empty() {
            let mut stmt = self
                .conn
                .prepare("SELECT path, title FROM notes ORDER BY path")
                .map_err(sql_err)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(sql_err)?;
            rows.flatten().collect()
        } else {
            let fts: Vec<String> = required
                .iter()
                .map(|t| match t {
                    Term::Word(w) => format!("\"{}\"*", w.replace('"', "")),
                    Term::Phrase(p) => format!("\"{}\"", p.replace('"', "")),
                    _ => String::new(),
                })
                .filter(|s| s.len() > 2)
                .collect();
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT n.path, n.title FROM notes_fts f JOIN notes n ON n.id = f.rowid WHERE notes_fts MATCH ?1 ORDER BY n.path",
                )
                .map_err(sql_err)?;
            let rows = stmt
                .query_map(params![fts.join(" AND ")], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(sql_err)?;
            rows.flatten().collect()
        };
        let boundings = crate::boundings::by_note(&crate::boundings::parse(
            &fs::read_to_string(self.root.join(crate::boundings::BOUNDINGS_FILE))
                .unwrap_or_default(),
        ));
        let tags = self.all_tags()?;
        let props = self.all_props()?;
        let mut highlight = Vec::new();
        positive_text_terms(&expr, &mut highlight);
        let mut cx = Cx {
            regex: HashMap::new(),
        };
        let empty_tags: Vec<String> = Vec::new();
        let empty_props: Vec<(String, String)> = Vec::new();
        let empty_boundings: Vec<String> = Vec::new();
        let mut results = Vec::new();
        for (path, title) in candidates {
            let text = fs::read_to_string(self.root.join(&path)).unwrap_or_default();
            let doc = Doc {
                path: &path,
                title: &title,
                text: &text,
                lower: text.to_lowercase(),
                tags: tags.get(&path).unwrap_or(&empty_tags),
                props: props.get(&path).unwrap_or(&empty_props),
                boundings: boundings.get(&path).unwrap_or(&empty_boundings),
            };
            if !eval(&expr, &doc, &mut cx) {
                continue;
            }
            let (matches, snippets) = snippets_for(&text, &highlight, &mut cx);
            results.push(SearchResult {
                path,
                title,
                matches,
                snippets,
            });
        }
        results.sort_by(|a, b| b.matches.cmp(&a.matches).then_with(|| a.path.cmp(&b.path)));
        let total = results.len() as u32;
        results.truncate(limit);
        Ok(SearchResponse {
            results,
            total,
            error: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folio::Folio;

    fn w(s: &str) -> Expr {
        Expr::Term(Term::Word(s.into()))
    }
    fn ph(s: &str) -> Expr {
        Expr::Term(Term::Phrase(s.into()))
    }
    fn re(s: &str) -> Expr {
        Expr::Term(Term::Regex(s.into()))
    }
    fn f(k: &str, v: &str) -> Expr {
        Expr::Term(Term::Field(k.into(), v.into()))
    }
    fn not(e: Expr) -> Expr {
        Expr::Not(Box::new(e))
    }

    #[test]
    fn parser_table() {
        let cases: Vec<(&str, Expr)> = vec![
            // words and implicit AND
            ("", Expr::Empty),
            ("   ", Expr::Empty),
            ("hello", w("hello")),
            ("hello world", Expr::And(vec![w("hello"), w("world")])),
            ("a b c", Expr::And(vec![w("a"), w("b"), w("c")])),
            ("Hello AND world", Expr::And(vec![w("Hello"), w("world")])),
            ("and", Expr::Empty),
            // phrases
            ("\"exact phrase\"", ph("exact phrase")),
            ("\"unterminated phrase", ph("unterminated phrase")),
            ("\"\"", Expr::Empty),
            (
                "word \"a phrase\" other",
                Expr::And(vec![w("word"), ph("a phrase"), w("other")]),
            ),
            ("\"phrase\"tail", Expr::And(vec![ph("phrase"), w("tail")])),
            // regex
            ("/re.*x/", re("re.*x")),
            ("/re\\/x/", re("re\\/x")),
            ("/case/i", re("case")),
            ("/unterminated", w("/unterminated")),
            ("a /b+/ c", Expr::And(vec![w("a"), re("b+"), w("c")])),
            // exclusion
            ("-draft", not(w("draft"))),
            ("a -b", Expr::And(vec![w("a"), not(w("b"))])),
            ("-\"a phrase\"", not(ph("a phrase"))),
            ("-tag:done", not(f("tag", "done"))),
            ("--a", not(not(w("a")))),
            ("- a", w("a")),
            ("-", Expr::Empty),
            // OR
            ("a OR b", Expr::Or(vec![w("a"), w("b")])),
            ("a or b", Expr::Or(vec![w("a"), w("b")])),
            ("a OR b OR c", Expr::Or(vec![w("a"), w("b"), w("c")])),
            (
                "a b OR c",
                Expr::Or(vec![Expr::And(vec![w("a"), w("b")]), w("c")]),
            ),
            ("OR a", w("a")),
            ("a OR", w("a")),
            ("OR", Expr::Empty),
            // grouping
            ("(a)", w("a")),
            (
                "(a OR b) c",
                Expr::And(vec![Expr::Or(vec![w("a"), w("b")]), w("c")]),
            ),
            (
                "a (b OR c)",
                Expr::And(vec![w("a"), Expr::Or(vec![w("b"), w("c")])]),
            ),
            ("-(a OR b)", not(Expr::Or(vec![w("a"), w("b")]))),
            ("((a))", w("a")),
            ("(a", w("a")),
            ("a)", w("a")),
            ("a) b", Expr::And(vec![w("a"), w("b")])),
            ("()", Expr::Empty),
            (
                "(a OR b)(c)",
                Expr::And(vec![Expr::Or(vec![w("a"), w("b")]), w("c")]),
            ),
            // fields
            ("path:Thesis/chapters", f("path", "Thesis/chapters")),
            ("tag:#research", f("tag", "#research")),
            ("TAG:Research", f("tag", "Research")),
            ("file:03", f("file", "03")),
            (
                "type:chapter status:done",
                Expr::And(vec![f("type", "chapter"), f("status", "done")]),
            ),
            ("bounding:Academic", f("bounding", "Academic")),
            ("has:image", f("has", "image")),
            ("title:\"Two words\"", f("title", "Two words")),
            ("status:", f("status", "")),
            ("http://example.com/x", w("http://example.com/x")),
            ("12:30", w("12:30")),
            // the Gate 2 query
            (
                "tag:#research bounding:Academic -status:done \"information operations\"",
                Expr::And(vec![
                    f("tag", "#research"),
                    f("bounding", "Academic"),
                    not(f("status", "done")),
                    ph("information operations"),
                ]),
            ),
        ];
        assert!(cases.len() >= 40);
        for (q, want) in cases {
            assert_eq!(parse(q).unwrap(), want, "query {q:?}");
        }
    }

    #[test]
    fn bad_regex_is_an_error() {
        let err = parse("/(/").unwrap_err();
        assert!(err.contains("Bad regular expression"));
    }

    fn folio_with(notes: &[(&str, &str)]) -> (tempfile::TempDir, Index) {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("T")).unwrap();
        for (path, text) in notes {
            let abs = dir.path().join(path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(abs, text).unwrap();
        }
        let idx = Index::open(&dir.path().join("i.sqlite"), &folio).unwrap();
        idx.refresh(&mut |_, _| {}).unwrap();
        (dir, idx)
    }

    fn paths(r: &SearchResponse) -> Vec<&str> {
        r.results.iter().map(|x| x.path.as_str()).collect()
    }

    #[test]
    fn evaluates_words_phrases_regex_fields_and_boolean_logic() {
        let (d, idx) = folio_with(&[
            (
                "Thesis/ch3.md",
                "---\ntype: chapter\nstatus: drafting\ntags: [research]\n---\n# Influence\nInformation operations and persuasion. #ops/info\n![[pic.png]]\n",
            ),
            (
                "Thesis/ch4.md",
                "---\ntype: chapter\nstatus: done\n---\n# Methods\nInterviews about information operations.\n- [ ] task\n",
            ),
            ("Inbox.md", "Quick thoughts on persuasive design.\n"),
        ]);
        fs::write(
            d.path().join(crate::boundings::BOUNDINGS_FILE),
            crate::boundings::to_yaml(&[crate::boundings::Bounding {
                id: "academic".into(),
                name: "Academic".into(),
                colour: "#006078".into(),
                icon: "🎓".into(),
                notes: vec!["Thesis/ch3.md".into()],
            }]),
        )
        .unwrap();
        let s = |q: &str| idx.search_query(q, 50).unwrap();
        assert_eq!(
            paths(&s("information")),
            vec!["Thesis/ch3.md", "Thesis/ch4.md"]
        );
        assert_eq!(paths(&s("persua")), vec!["Inbox.md", "Thesis/ch3.md"]);
        assert_eq!(
            paths(&s("formation")),
            Vec::<&str>::new(),
            "words match at word starts only"
        );
        assert_eq!(
            paths(&s("\"information operations\"")),
            vec!["Thesis/ch3.md", "Thesis/ch4.md"]
        );
        assert_eq!(paths(&s("\"operations and\"")), vec!["Thesis/ch3.md"]);
        assert_eq!(paths(&s("/interv\\w+s/")), vec!["Thesis/ch4.md"]);
        assert_eq!(paths(&s("information -status:done")), vec!["Thesis/ch3.md"]);
        assert_eq!(paths(&s("tag:research")), vec!["Thesis/ch3.md"]);
        assert_eq!(
            paths(&s("tag:#OPS")),
            vec!["Thesis/ch3.md"],
            "nested and case-insensitive"
        );
        assert_eq!(
            paths(&s("type:chapter")),
            vec!["Thesis/ch3.md", "Thesis/ch4.md"]
        );
        assert_eq!(
            paths(&s("status:")),
            vec!["Thesis/ch3.md", "Thesis/ch4.md"],
            "any value"
        );
        assert_eq!(paths(&s("path:thesis/ -has:task")), vec!["Thesis/ch3.md"]);
        assert_eq!(paths(&s("file:ch4")), vec!["Thesis/ch4.md"]);
        assert_eq!(paths(&s("has:image")), vec!["Thesis/ch3.md"]);
        assert_eq!(paths(&s("title:inbox")), vec!["Inbox.md"]);
        assert_eq!(
            paths(&s("inbox OR status:done")),
            vec!["Inbox.md", "Thesis/ch4.md"]
        );
        assert_eq!(
            paths(&s("(persuasion OR interviews) -tag:research")),
            vec!["Thesis/ch4.md"]
        );
        assert_eq!(
            paths(&s("bounding:academic")),
            vec!["Thesis/ch3.md"],
            "Boundings match by name, case-insensitively"
        );
        assert_eq!(
            paths(&s("-bounding:Academic")),
            vec!["Inbox.md", "Thesis/ch4.md"]
        );
        assert_eq!(paths(&s("")), Vec::<&str>::new());
        let r = s("/(/");
        assert!(r.error.as_deref().unwrap_or("").contains("Bad regular"));
        assert!(r.results.is_empty());
    }

    #[test]
    fn snippets_mark_hits_count_them_and_carry_the_section() {
        let (_d, idx) = folio_with(&[(
            "n.md",
            "# One\nalpha beta\n## Two\nAlpha again, alphabet, and alpha.\n```\nalpha in code\n```\n",
        )]);
        let r = idx.search_query("alpha", 10).unwrap();
        let hit = &r.results[0];
        assert_eq!(hit.matches, 5);
        assert_eq!(hit.snippets.len(), 3);
        assert_eq!(hit.snippets[0].text, "«alpha» beta");
        assert_eq!(hit.snippets[0].section.as_deref(), Some("One"));
        assert_eq!(
            hit.snippets[1].text,
            "«Alpha» again, «alphabet», and «alpha»."
        );
        assert_eq!(hit.snippets[1].section.as_deref(), Some("Two"));
        assert_eq!(hit.snippets[1].line, 4);
        // Field-only queries show the first body line instead.
        let r = idx.search_query("path:n.md", 10).unwrap();
        assert_eq!(r.results[0].matches, 0);
        assert_eq!(r.results[0].snippets[0].text, "# One");
        // Limit vs total.
        let r = idx.search_query("alpha", 0).unwrap();
        assert_eq!((r.total, r.results.len()), (1, 0));
    }
}
