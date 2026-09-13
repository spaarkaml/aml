//! The Folio's own settings file, `.aml/config.yaml` (ADR-010).
//!
//! Appearance lives in the Folio so that the colours and type you chose follow you between
//! machines. Like `boundings.yaml`, the file is synced, so it is written one setting per line
//! and in a stable order: two devices that change different settings edit different lines.
//!
//! Settings are held as dotted paths (`appearance.paper.bg`) and written back as nested YAML.
//! Anything this version does not understand is kept and written out again — the file will
//! hold more than appearance before long, and an older AML must not silently drop it.

use std::collections::BTreeMap;
use std::fs;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::folio::{write_atomic, Folio, Result};

pub const CONFIG_FILE: &str = ".aml/config.yaml";
const HEADER: &str = "# AML configuration (ADR-010). One setting per line: this file is synced,\n# and line-per-setting keeps merges clean. AML rewrites it in this shape.\n";

/// Everything the Appearance screen owns. Every field is optional: absent means "AML's own".
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    /// "system", "paper" or "ink".
    pub mode: Option<String>,
    pub ui_font: Option<String>,
    pub editor_font: Option<String>,
    /// Line width in characters.
    pub measure: Option<f64>,
    pub leading: Option<f64>,
    pub paragraph_spacing: Option<f64>,
    /// Token name (`bg`, `text`, …) to `#rrggbb`, per mode.
    pub paper: BTreeMap<String, String>,
    pub ink: BTreeMap<String, String>,
}

/// Everything the Settings screen owns that is not appearance (WP-3.10). Optional in the same
/// way: absent means the built-in behaviour, and is left out of the file entirely.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    /// Folder new Daily notes are written into. Absent means `journal`.
    pub daily_folder: Option<String>,
    /// Words a day to aim for. Absent means no daily goal, which is the default: a goal you
    /// did not set is not a goal you are failing (Q18 — all of these are opt-in).
    pub daily_goal: Option<f64>,
    /// Days every Snapshot is kept. Absent means 7 (ADR-006).
    pub snapshot_keep_all_days: Option<f64>,
    /// Days one Snapshot a day is kept, counted from now. Absent means 90.
    pub snapshot_keep_daily_days: Option<f64>,
}

/* ---------------- the file ---------------- */

fn quote(value: &str) -> String {
    let numeric = value.parse::<f64>().is_ok();
    let boolean = value == "true" || value == "false";
    if numeric || boolean {
        value.to_string()
    } else {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

fn unquote(value: &str) -> String {
    let t = value.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        t[1..t.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    } else {
        t.to_string()
    }
}

/// Settings by dotted path. Lines that are not `key:` or `key: value` are ignored.
pub fn parse(text: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    // One entry per open level: (indent, key).
    let mut stack: Vec<(usize, String)> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() || trimmed.trim_start().starts_with('#') {
            continue;
        }
        let indent = trimmed.len() - trimmed.trim_start().len();
        let Some((key, value)) = trimmed.trim().split_once(':') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        while stack.last().is_some_and(|(i, _)| *i >= indent) {
            stack.pop();
        }
        let value = value.trim();
        if value.is_empty() {
            stack.push((indent, key.to_string()));
            continue;
        }
        let mut path: Vec<&str> = stack.iter().map(|(_, k)| k.as_str()).collect();
        path.push(key);
        out.insert(path.join("."), unquote(value));
    }
    out
}

/// Nested YAML, keys in order, one setting per line.
pub fn to_yaml(settings: &BTreeMap<String, String>) -> String {
    let mut out = String::from(HEADER);
    let mut open: Vec<&str> = Vec::new();
    for (path, value) in settings {
        let parts: Vec<&str> = path.split('.').collect();
        let (leaf, parents) = parts.split_last().unwrap_or((&"", &[]));
        // Close the sections this key is not in, then open the ones it is.
        while open.len() > parents.len() || (!open.is_empty() && open[..] != parents[..open.len()])
        {
            open.pop();
        }
        for parent in &parents[open.len()..] {
            out.push_str(&format!("{}{}:\n", "  ".repeat(open.len()), parent));
            open.push(parent);
        }
        out.push_str(&format!(
            "{}{}: {}\n",
            "  ".repeat(open.len()),
            leaf,
            quote(value)
        ));
    }
    out
}

/* ---------------- reading and writing ---------------- */

fn number(settings: &BTreeMap<String, String>, key: &str) -> Option<f64> {
    settings.get(key).and_then(|v| v.parse().ok())
}

fn section(settings: &BTreeMap<String, String>, prefix: &str) -> BTreeMap<String, String> {
    settings
        .iter()
        .filter_map(|(k, v)| {
            k.strip_prefix(prefix)
                .map(|rest| (rest.to_string(), v.clone()))
        })
        .collect()
}

pub fn appearance_of(settings: &BTreeMap<String, String>) -> Appearance {
    Appearance {
        mode: settings.get("appearance.mode").cloned(),
        ui_font: settings.get("appearance.uiFont").cloned(),
        editor_font: settings.get("appearance.editorFont").cloned(),
        measure: number(settings, "appearance.measure"),
        leading: number(settings, "appearance.leading"),
        paragraph_spacing: number(settings, "appearance.paragraphSpacing"),
        paper: section(settings, "appearance.paper."),
        ink: section(settings, "appearance.ink."),
    }
}

pub fn preferences_of(settings: &BTreeMap<String, String>) -> Preferences {
    Preferences {
        daily_folder: settings.get("daily.folder").cloned(),
        daily_goal: number(settings, "goals.daily").filter(|n| *n > 0.0),
        snapshot_keep_all_days: number(settings, "snapshots.keepAllDays"),
        snapshot_keep_daily_days: number(settings, "snapshots.keepDailyDays"),
    }
}

/// Snapshot retention as the Folio asks for it. Never less than a day of everything, and the
/// daily stretch never ends before the keep-everything one does.
pub fn retention_of(settings: &BTreeMap<String, String>) -> crate::snapshots::Retention {
    let days = |key: &str, default: u32| {
        number(settings, key)
            .filter(|n| n.is_finite() && *n >= 1.0)
            .map(|n| n.round().min(36_500.0) as u32)
            .unwrap_or(default)
    };
    let keep_all_days = days(
        "snapshots.keepAllDays",
        crate::snapshots::DEFAULT_KEEP_ALL_DAYS,
    );
    let keep_daily_days = days(
        "snapshots.keepDailyDays",
        crate::snapshots::DEFAULT_KEEP_DAILY_DAYS,
    )
    .max(keep_all_days);
    crate::snapshots::Retention {
        keep_all_days,
        keep_daily_days,
    }
}

fn put(settings: &mut BTreeMap<String, String>, key: &str, value: Option<String>) {
    match value {
        Some(v) if !v.is_empty() => {
            settings.insert(key.to_string(), v);
        }
        // An absent setting is removed rather than written empty: absent means "AML's own".
        _ => {
            settings.remove(key);
        }
    }
}

pub fn with_appearance(
    mut settings: BTreeMap<String, String>,
    appearance: &Appearance,
) -> BTreeMap<String, String> {
    put(&mut settings, "appearance.mode", appearance.mode.clone());
    put(
        &mut settings,
        "appearance.uiFont",
        appearance.ui_font.clone(),
    );
    put(
        &mut settings,
        "appearance.editorFont",
        appearance.editor_font.clone(),
    );
    put(
        &mut settings,
        "appearance.measure",
        appearance.measure.map(|v| v.to_string()),
    );
    put(
        &mut settings,
        "appearance.leading",
        appearance.leading.map(|v| v.to_string()),
    );
    put(
        &mut settings,
        "appearance.paragraphSpacing",
        appearance.paragraph_spacing.map(|v| v.to_string()),
    );
    settings
        .retain(|k, _| !k.starts_with("appearance.paper.") && !k.starts_with("appearance.ink."));
    for (token, hex) in &appearance.paper {
        settings.insert(format!("appearance.paper.{token}"), hex.clone());
    }
    for (token, hex) in &appearance.ink {
        settings.insert(format!("appearance.ink.{token}"), hex.clone());
    }
    settings
}

pub fn with_preferences(
    mut settings: BTreeMap<String, String>,
    preferences: &Preferences,
) -> BTreeMap<String, String> {
    put(
        &mut settings,
        "daily.folder",
        preferences.daily_folder.clone(),
    );
    put(
        &mut settings,
        "goals.daily",
        preferences
            .daily_goal
            .filter(|n| *n > 0.0)
            .map(|n| n.round().to_string()),
    );
    let days = |n: Option<f64>| {
        n.filter(|n| n.is_finite() && *n >= 1.0)
            .map(|n| n.round().to_string())
    };
    put(
        &mut settings,
        "snapshots.keepAllDays",
        days(preferences.snapshot_keep_all_days),
    );
    put(
        &mut settings,
        "snapshots.keepDailyDays",
        days(preferences.snapshot_keep_daily_days),
    );
    settings
}

impl Folio {
    pub fn settings(&self) -> Result<BTreeMap<String, String>> {
        let path = self.root().join(CONFIG_FILE);
        Ok(fs::read_to_string(path)
            .map(|t| parse(&t))
            .unwrap_or_default())
    }

    pub fn write_settings(&self, settings: &BTreeMap<String, String>) -> Result<()> {
        let path = self.root().join(CONFIG_FILE);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(&path, to_yaml(settings).as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Appearance {
        Appearance {
            mode: Some("ink".into()),
            ui_font: None,
            editor_font: Some("EB Garamond".into()),
            measure: Some(72.0),
            leading: Some(1.7),
            paragraph_spacing: None,
            paper: BTreeMap::from([("bg".to_string(), "#fffdf8".to_string())]),
            ink: BTreeMap::from([
                ("bg".to_string(), "#101820".to_string()),
                ("text".to_string(), "#f0e9e7".to_string()),
            ]),
        }
    }

    #[test]
    fn round_trips_through_nested_yaml_one_setting_per_line() {
        let settings = with_appearance(BTreeMap::new(), &sample());
        let text = to_yaml(&settings);
        assert_eq!(appearance_of(&parse(&text)), sample());
        assert!(text.contains("appearance:\n"));
        assert!(text.contains("  editorFont: \"EB Garamond\"\n"));
        // Numbers are written as numbers, colours as strings, each on its own line.
        assert!(text.contains("  measure: 72\n"));
        assert!(text.contains("  ink:\n    bg: \"#101820\"\n    text: \"#f0e9e7\"\n"));
        // A setting AML has nothing for is left out entirely rather than written empty.
        assert!(!text.contains("uiFont"));
        assert!(!text.contains("paragraphSpacing"));
    }

    #[test]
    fn preferences_share_the_file_with_appearance() {
        let settings = with_appearance(BTreeMap::new(), &sample());
        let settings = with_preferences(
            settings,
            &Preferences {
                daily_folder: Some("Notes/Days".into()),
                daily_goal: Some(500.0),
                ..Preferences::default()
            },
        );
        let text = to_yaml(&settings);
        // Its own section, one setting per line, alongside appearance rather than inside it.
        assert!(text.contains("daily:\n  folder: \"Notes/Days\"\n"));
        assert!(text.contains("goals:\n  daily: 500\n"));
        let read = parse(&text);
        assert_eq!(
            preferences_of(&read).daily_folder.as_deref(),
            Some("Notes/Days")
        );
        assert_eq!(preferences_of(&read).daily_goal, Some(500.0));
        assert_eq!(appearance_of(&read), sample());

        // Clearing it removes the line rather than writing an empty one: absent means `journal`.
        let cleared = with_preferences(read, &Preferences::default());
        assert!(!to_yaml(&cleared).contains("daily:"));
        assert!(!to_yaml(&cleared).contains("goals:"));
        assert_eq!(preferences_of(&cleared).daily_folder, None);
        // A goal of zero is no goal, not a goal of nothing.
        let zeroed = with_preferences(
            BTreeMap::new(),
            &Preferences {
                daily_folder: None,
                daily_goal: Some(0.0),
                ..Preferences::default()
            },
        );
        assert_eq!(preferences_of(&zeroed).daily_goal, None);
    }

    #[test]
    fn snapshot_retention_is_read_with_sane_floors() {
        let mut settings = BTreeMap::new();
        assert_eq!(
            retention_of(&settings),
            crate::snapshots::Retention::default()
        );
        settings = with_preferences(
            settings,
            &Preferences {
                snapshot_keep_all_days: Some(14.0),
                snapshot_keep_daily_days: Some(3.0),
                ..Preferences::default()
            },
        );
        let text = to_yaml(&settings);
        assert!(text.contains("snapshots:\n  keepAllDays: 14\n  keepDailyDays: 3\n"));
        // The daily stretch never ends before the keep-everything one.
        let r = retention_of(&parse(&text));
        assert_eq!((r.keep_all_days, r.keep_daily_days), (14, 14));
        settings.insert("snapshots.keepAllDays".into(), "0".into());
        assert_eq!(retention_of(&settings).keep_all_days, 7);
    }

    #[test]
    fn keeps_settings_it_does_not_understand() {
        let text = "# mine\ncompile:\n  design: \"Academic Thesis\"\n  trim: \"6x9\"\nappearance:\n  mode: \"paper\"\n";
        let settings = parse(text);
        assert_eq!(settings["compile.design"], "Academic Thesis");
        let next = with_appearance(settings, &sample());
        let written = to_yaml(&next);
        // The appearance changed; the section this version knows nothing about survived.
        assert!(written.contains("compile:\n  design: \"Academic Thesis\"\n  trim: \"6x9\"\n"));
        assert!(written.contains("mode: \"ink\""));
    }

    #[test]
    fn reads_a_hand_written_file_and_ignores_junk() {
        let settings = parse(
            "appearance:\n  mode: paper\n  measure: 68\n  nonsense\n  paper:\n    bg: '#ffffff'\n",
        );
        let appearance = appearance_of(&settings);
        assert_eq!(appearance.mode.as_deref(), Some("paper"));
        assert_eq!(appearance.measure, Some(68.0));
        // Unquoted and single-quoted values are read as written.
        assert_eq!(appearance.paper["bg"], "'#ffffff'");
    }

    #[test]
    fn writes_and_reads_the_file_in_a_folio() {
        let dir = tempfile::tempdir().unwrap();
        let folio = Folio::create(dir.path(), Some("Writing")).unwrap();
        // A new Folio already has a config file: version and name, written when it was created.
        let initial = folio.settings().unwrap();
        assert_eq!(initial["version"], "1");
        assert_eq!(initial["name"], "Writing");

        folio
            .write_settings(&with_appearance(initial, &sample()))
            .unwrap();
        let after = folio.settings().unwrap();
        assert_eq!(appearance_of(&after), sample());
        // Saving appearance must not lose what was already in the file.
        assert_eq!(after["version"], "1");
        assert_eq!(after["name"], "Writing");
        assert!(folio.root().join(CONFIG_FILE).is_file());
    }
}
