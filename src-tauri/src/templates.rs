//! Templates and Daily notes (WP-2.7).
//!
//! A template is a `.md` file in `_templates/` whose placeholders are expanded when a note
//! is made from it. The caller supplies "now" (the app knows the device's timezone; this
//! module only does civil-date arithmetic), so rendering is deterministic and testable.

use std::fs;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::folio::{Folio, FolioError, Result};

pub const TEMPLATES_DIR: &str = "_templates";
pub const JOURNAL_DIR: &str = "journal";
/// The template a Daily note is made from, when the Folio has one.
pub const DAILY_TEMPLATE: &str = "daily";

/// Used when a Folio has no `_templates/daily.md` yet, so "Today" works on day one.
pub const DEFAULT_DAILY: &str = "---\ntype: daily\n---\n\n# {{date:dddd D MMMM YYYY}}\n\n";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    /// File stem — what the commands take, e.g. "daily".
    pub name: String,
    pub path: String,
    /// The template's front-matter `type:`, if it declares one (Note Types arrive in WP-3.3).
    pub note_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderVars {
    pub title: String,
    /// The note's date as `YYYY-MM-DD`, in the device's timezone.
    pub date: String,
    /// `HH:MM`, 24-hour.
    pub time: String,
}

/* ---------------- civil dates ---------------- */

/// A calendar date with no timezone attached.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Civil {
    pub y: i32,
    pub m: u32,
    pub d: u32,
}

const WEEKDAYS: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

impl Civil {
    pub fn parse(s: &str) -> Option<Self> {
        let b = s.as_bytes();
        if b.len() < 10 || b[4] != b'-' || b[7] != b'-' {
            return None;
        }
        let y: i32 = s.get(0..4)?.parse().ok()?;
        let m: u32 = s.get(5..7)?.parse().ok()?;
        let d: u32 = s.get(8..10)?.parse().ok()?;
        if !(1..=12).contains(&m) || d < 1 || d > days_in_month(y, m) {
            return None;
        }
        Some(Civil { y, m, d })
    }

    pub fn iso(&self) -> String {
        format!("{:04}-{:02}-{:02}", self.y, self.m, self.d)
    }

    /// Days since 1970-01-01 (Howard Hinnant's `days_from_civil`).
    pub fn days(&self) -> i64 {
        let y = if self.m <= 2 { self.y - 1 } else { self.y } as i64;
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400;
        let m = self.m as i64;
        let d = self.d as i64;
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    pub fn from_days(z: i64) -> Self {
        let z = z + 719_468;
        let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        Civil {
            y: (if m <= 2 { y + 1 } else { y }) as i32,
            m: m as u32,
            d: d as u32,
        }
    }

    pub fn add_days(&self, n: i64) -> Self {
        Self::from_days(self.days() + n)
    }

    /// 0 = Monday.
    pub fn weekday(&self) -> usize {
        (self.days().rem_euclid(7) as usize + 3) % 7
    }

    /// Formats with the tokens `YYYY YY MMMM MMM MM M dddd ddd DD D`; anything else is literal.
    pub fn format(&self, fmt: &str) -> String {
        let mut out = String::with_capacity(fmt.len() + 8);
        let mut rest = fmt;
        let tokens: [FormatToken; 10] = [
            ("YYYY", |c| format!("{:04}", c.y)),
            ("YY", |c| format!("{:02}", c.y.rem_euclid(100))),
            ("MMMM", |c| MONTHS[(c.m - 1) as usize].to_string()),
            ("MMM", |c| MONTHS[(c.m - 1) as usize][..3].to_string()),
            ("MM", |c| format!("{:02}", c.m)),
            ("M", |c| c.m.to_string()),
            ("dddd", |c| WEEKDAYS[c.weekday()].to_string()),
            ("ddd", |c| WEEKDAYS[c.weekday()][..3].to_string()),
            ("DD", |c| format!("{:02}", c.d)),
            ("D", |c| c.d.to_string()),
        ];
        'outer: while !rest.is_empty() {
            for (token, f) in tokens.iter() {
                if let Some(tail) = rest.strip_prefix(token) {
                    out.push_str(&f(self));
                    rest = tail;
                    continue 'outer;
                }
            }
            let ch = rest.chars().next().unwrap_or_default();
            out.push(ch);
            rest = &rest[ch.len_utf8()..];
        }
        out
    }
}

/// A format token and the text it stands for, longest first so `MMMM` wins over `MM`.
type FormatToken = (&'static str, fn(&Civil) -> String);

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        _ => 0,
    }
}

/* ---------------- rendering ---------------- */

/// Expands `{{title}}`, `{{date}}`, `{{time}}`, `{{yesterday}}` and `{{tomorrow}}`, each of the
/// date placeholders optionally with a format (`{{date:dddd D MMMM}}`).
///
/// A placeholder this function does not know is left exactly as written: like a Raw node, we
/// never silently drop text the user put in a file.
pub fn render(text: &str, vars: &RenderVars) -> String {
    let date = Civil::parse(&vars.date);
    let mut out = String::with_capacity(text.len() + 32);
    let mut rest = text;
    while let Some(at) = rest.find("{{") {
        out.push_str(&rest[..at]);
        let after = &rest[at + 2..];
        let Some(close) = after.find("}}") else {
            out.push_str(&rest[at..]);
            return out;
        };
        let body = after[..close].trim();
        let (name, fmt) = match body.split_once(':') {
            Some((n, f)) => (n.trim(), Some(f.trim())),
            None => (body, None),
        };
        let shifted = |n: i64| date.map(|d| d.add_days(n));
        let value: Option<String> = match name {
            "title" if fmt.is_none() => Some(vars.title.clone()),
            "time" if fmt.is_none() => Some(vars.time.clone()),
            "date" => shifted(0).map(|d| fmt.map_or_else(|| d.iso(), |f| d.format(f))),
            "yesterday" => shifted(-1).map(|d| fmt.map_or_else(|| d.iso(), |f| d.format(f))),
            "tomorrow" => shifted(1).map(|d| fmt.map_or_else(|| d.iso(), |f| d.format(f))),
            _ => None,
        };
        match value {
            Some(v) => out.push_str(&v),
            None => out.push_str(&rest[at..at + 2 + close + 2]),
        }
        rest = &after[close + 2..];
    }
    out.push_str(rest);
    out
}

/* ---------------- the Folio side ---------------- */

/// The folder Daily notes are written into, from the Folio's `daily.folder` setting.
/// Anything that is not a plain relative folder inside the Folio is refused, so a
/// hand-edited config file can never send a note outside it.
pub fn daily_folder(setting: Option<&str>) -> Option<String> {
    let cleaned = setting?.replace('\\', "/");
    let cleaned = cleaned.trim().trim_matches('/');
    if cleaned.is_empty()
        || cleaned
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
    {
        return None;
    }
    Some(cleaned.to_string())
}

/// The canonical location of a Daily note: `<folder>/YYYY/YYYY-MM-DD.md`, where the folder
/// is the Folio's own (`journal` unless Settings says otherwise).
pub fn daily_path(folder: &str, date: &str) -> Result<String> {
    let d = Civil::parse(date).ok_or_else(|| FolioError::InvalidPath(date.to_string()))?;
    Ok(format!("{folder}/{:04}/{}.md", d.y, d.iso()))
}

impl Folio {
    /// Every `.md` directly inside `_templates/`, sorted by name.
    pub fn templates(&self) -> Result<Vec<TemplateInfo>> {
        let dir = self.root().join(TEMPLATES_DIR);
        let Ok(entries) = fs::read_dir(&dir) else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file()
                || path
                    .extension()
                    .is_none_or(|e| !e.eq_ignore_ascii_case("md"))
            {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let text = fs::read_to_string(&path).unwrap_or_default();
            out.push(TemplateInfo {
                name: name.to_string(),
                path: format!("{TEMPLATES_DIR}/{name}.md"),
                note_type: front_matter_type(&text),
            });
        }
        out.sort_by_key(|t| t.name.to_lowercase());
        Ok(out)
    }

    /// The template's raw text, or None when the Folio has no template by that name.
    pub fn template_text(&self, name: &str) -> Option<String> {
        if name.is_empty() || name.contains(['/', '\\', '.']) {
            return None;
        }
        fs::read_to_string(self.root().join(TEMPLATES_DIR).join(format!("{name}.md"))).ok()
    }

    /// The folder this Folio keeps its Daily notes in; `journal` unless Settings says otherwise.
    pub fn daily_dir(&self) -> String {
        self.settings()
            .ok()
            .and_then(|s| s.get("daily.folder").cloned())
            .and_then(|v| daily_folder(Some(&v)))
            .unwrap_or_else(|| JOURNAL_DIR.to_string())
    }

    /// Dates of every Daily note in the Folio, newest first. `<folder>/YYYY/` is where they are
    /// written, but a flat `<folder>/YYYY-MM-DD.md` (as other apps write them) is read too.
    pub fn daily_dates(&self) -> Result<Vec<String>> {
        let mut out = Vec::new();
        collect_dailies(&self.root().join(self.daily_dir()), 0, &mut out);
        out.sort();
        out.dedup();
        out.reverse();
        Ok(out)
    }
}

fn collect_dailies(dir: &std::path::Path, depth: usize, out: &mut Vec<String>) {
    if depth > 2 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_dailies(&path, depth + 1, out);
        } else if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("md"))
                && Civil::parse(stem).is_some()
            {
                out.push(stem.to_string());
            }
        }
    }
}

fn front_matter_type(text: &str) -> Option<String> {
    let rest = text.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;
    rest[..end].lines().find_map(|l| {
        let v = l.strip_prefix("type:")?.trim().trim_matches(['"', '\'']);
        (!v.is_empty()).then(|| v.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars() -> RenderVars {
        RenderVars {
            title: "Interview protocol".into(),
            date: "2026-09-10".into(),
            time: "09:41".into(),
        }
    }

    #[test]
    fn civil_dates_round_trip_and_walk() {
        for iso in ["1970-01-01", "2026-09-10", "2024-02-29", "1999-12-31"] {
            let c = Civil::parse(iso).expect(iso);
            assert_eq!(c.iso(), iso);
            assert_eq!(Civil::from_days(c.days()), c);
        }
        // 2026-09-10 is a Thursday; stepping over month and leap-year ends stays right.
        assert_eq!(Civil::parse("2026-09-10").unwrap().weekday(), 3);
        assert_eq!(
            Civil::parse("2026-09-30").unwrap().add_days(1).iso(),
            "2026-10-01"
        );
        assert_eq!(
            Civil::parse("2024-03-01").unwrap().add_days(-1).iso(),
            "2024-02-29"
        );
        assert_eq!(
            Civil::parse("2026-01-01").unwrap().add_days(-1).iso(),
            "2025-12-31"
        );
        assert!(Civil::parse("2026-02-30").is_none());
        assert!(Civil::parse("not a date").is_none());
    }

    #[test]
    fn formats_with_the_documented_tokens() {
        let d = Civil::parse("2026-09-10").unwrap();
        assert_eq!(d.format("dddd D MMMM YYYY"), "Thursday 10 September 2026");
        assert_eq!(d.format("ddd DD/MM/YY"), "Thu 10/09/26");
        assert_eq!(d.format("MMM"), "Sep");
        // Anything that is not a token survives verbatim, punctuation and all.
        assert_eq!(d.format("[YYYY]"), "[2026]");
    }

    #[test]
    fn renders_known_placeholders_and_keeps_unknown_ones() {
        let out = render(
            "# {{title}}\n\n{{date}} at {{time}}, {{date:dddd}}\nback: [[{{yesterday}}]] on: [[{{tomorrow}}]]\n{{mystery}} {{title:x}} {{unclosed\n",
            &vars(),
        );
        assert_eq!(
            out,
            "# Interview protocol\n\n2026-09-10 at 09:41, Thursday\nback: [[2026-09-09]] on: [[2026-09-11]]\n{{mystery}} {{title:x}} {{unclosed\n"
        );
    }

    #[test]
    fn a_template_without_placeholders_is_unchanged() {
        let text = "# Nothing to expand\n\nJust prose with { braces } in it.\n";
        assert_eq!(render(text, &vars()), text);
    }

    #[test]
    fn daily_paths_are_year_foldered() {
        assert_eq!(
            daily_path(JOURNAL_DIR, "2026-09-10").unwrap(),
            "journal/2026/2026-09-10.md"
        );
        assert_eq!(
            daily_path("Notes/Days", "2026-09-10").unwrap(),
            "Notes/Days/2026/2026-09-10.md"
        );
        assert!(daily_path(JOURNAL_DIR, "2026-13-01").is_err());
    }

    #[test]
    fn the_daily_folder_setting_is_cleaned_and_never_escapes_the_folio() {
        assert_eq!(
            daily_folder(Some("Notes/Days")).as_deref(),
            Some("Notes/Days")
        );
        // Tidied rather than refused: a trailing slash or a Windows separator is a typo.
        assert_eq!(daily_folder(Some(" /Days/ ")).as_deref(), Some("Days"));
        assert_eq!(
            daily_folder(Some("Notes\\Days")).as_deref(),
            Some("Notes/Days")
        );
        // Absent, empty or an attempt to climb out falls back to the Folio's own `journal`.
        assert_eq!(daily_folder(None), None);
        assert_eq!(daily_folder(Some("   ")), None);
        assert_eq!(daily_folder(Some("../elsewhere")), None);
        assert_eq!(daily_folder(Some("Notes/../../etc")), None);
    }

    #[test]
    fn dailies_follow_the_folder_the_settings_name() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Writing")).unwrap();
        assert_eq!(folio.daily_dir(), JOURNAL_DIR);

        let mut settings = folio.settings().unwrap();
        settings.insert("daily.folder".into(), "Days".into());
        folio.write_settings(&settings).unwrap();
        assert_eq!(folio.daily_dir(), "Days");

        fs::create_dir_all(folio.root().join("Days/2026")).unwrap();
        fs::write(folio.root().join("Days/2026/2026-09-10.md"), "moved").unwrap();
        assert_eq!(folio.daily_dates().unwrap(), ["2026-09-10"]);
    }

    #[test]
    fn templates_are_listed_with_their_type_and_dailies_are_found_at_both_depths() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Writing")).unwrap();
        let root = folio.root();
        fs::create_dir_all(root.join(TEMPLATES_DIR)).unwrap();
        fs::write(
            root.join(TEMPLATES_DIR).join("daily.md"),
            "---\ntype: daily\n---\n\n# {{date}}\n",
        )
        .unwrap();
        fs::write(root.join(TEMPLATES_DIR).join("Scene.md"), "# {{title}}\n").unwrap();
        fs::write(root.join(TEMPLATES_DIR).join("notes.txt"), "ignored").unwrap();

        let list = folio.templates().unwrap();
        assert_eq!(
            list.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            ["daily", "Scene"]
        );
        assert_eq!(list[0].note_type.as_deref(), Some("daily"));
        assert_eq!(list[1].note_type, None);
        assert!(folio.template_text("daily").unwrap().contains("{{date}}"));
        assert!(folio.template_text("../secrets").is_none());

        fs::create_dir_all(root.join(JOURNAL_DIR).join("2026")).unwrap();
        fs::write(root.join(JOURNAL_DIR).join("2026-09-08.md"), "flat").unwrap();
        fs::write(
            root.join(JOURNAL_DIR).join("2026").join("2026-09-10.md"),
            "foldered",
        )
        .unwrap();
        fs::write(root.join(JOURNAL_DIR).join("not-a-daily.md"), "ignored").unwrap();
        assert_eq!(folio.daily_dates().unwrap(), ["2026-09-10", "2026-09-08"]);
    }
}
