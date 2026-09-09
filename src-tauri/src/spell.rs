//! Australian English spell checking (ADR-009): a bundled SCOWL en_AU Hunspell dictionary
//! checked in Rust with `spellbook`, plus a personal dictionary at `.aml/dictionary.txt`
//! (one word per line, sorted, so Syncthing merges are trivial) and a session ignore list.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::folio::{write_atomic, FolioError, Result};

const AFF: &str = include_str!("../resources/dict/en_AU.aff");
const DIC: &str = include_str!("../resources/dict/en_AU.dic");
pub const PERSONAL_FILE: &str = "dictionary.txt";

#[derive(Default)]
pub struct Speller {
    dict: Option<spellbook::Dictionary>,
    personal: BTreeSet<String>,
    personal_path: Option<PathBuf>,
    ignored: BTreeSet<String>,
}

impl Speller {
    /// The dictionary takes ~100 ms to parse, so it is built on first use, not at start-up.
    fn dict(&mut self) -> Result<&spellbook::Dictionary> {
        if self.dict.is_none() {
            let d = spellbook::Dictionary::new(AFF, DIC)
                .map_err(|e| FolioError::Io(format!("en_AU dictionary: {e}")))?;
            self.dict = Some(d);
        }
        Ok(self.dict.as_ref().expect("dictionary just built"))
    }

    /// Loads the personal dictionary for the Folio at `aml_dir` (`<Folio>/.aml`).
    pub fn load_personal(&mut self, aml_dir: &Path) {
        let path = aml_dir.join(PERSONAL_FILE);
        self.personal = fs::read_to_string(&path)
            .map(|t| {
                t.lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();
        self.personal_path = Some(path);
        self.ignored.clear();
    }

    pub fn unload_personal(&mut self) {
        self.personal.clear();
        self.personal_path = None;
        self.ignored.clear();
    }

    pub fn is_correct(&mut self, word: &str) -> Result<bool> {
        if word.is_empty() || self.personal.contains(word) || self.ignored.contains(word) {
            return Ok(true);
        }
        let lower = word.to_lowercase();
        if self.personal.contains(&lower) {
            return Ok(true);
        }
        Ok(self.dict()?.check(word))
    }

    /// Returns the subset of `words` that are misspelled, in input order, deduplicated.
    pub fn misspelled(&mut self, words: &[String]) -> Result<Vec<String>> {
        let mut seen = BTreeSet::new();
        let mut out = Vec::new();
        for w in words {
            if !seen.insert(w.as_str()) {
                continue;
            }
            if !self.is_correct(w)? {
                out.push(w.clone());
            }
        }
        Ok(out)
    }

    pub fn suggest(&mut self, word: &str, limit: usize) -> Result<Vec<String>> {
        let mut out = Vec::new();
        self.dict()?.suggest(word, &mut out);
        out.truncate(limit);
        Ok(out)
    }

    /// Adds `word` to the personal dictionary and rewrites `.aml/dictionary.txt`.
    pub fn add(&mut self, word: &str) -> Result<()> {
        let word = word.trim();
        if word.is_empty() {
            return Ok(());
        }
        self.personal.insert(word.to_string());
        let Some(path) = &self.personal_path else {
            return Err(FolioError::NoFolioOpen);
        };
        let mut text: String = self.personal.iter().map(|w| format!("{w}\n")).collect();
        text.insert_str(0, "# AML personal dictionary — one word per line\n");
        write_atomic(path, text.as_bytes())
    }

    pub fn ignore(&mut self, word: &str) {
        self.ignored.insert(word.trim().to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn australian_spellings_pass_and_common_errors_fail() {
        let mut s = Speller::default();
        for w in [
            "colour", "organise", "realise", "centre", "travelling", "labour",
            "defence", "licence", "analyse", "catalogue", "grey", "tyre", "kerb", "aluminium",
            "mum", "fortnight", "neighbour", "favourite", "theatre", "metre", "litre",
            "apologise", "recognise", "behaviour", "honour", "jewellery", "cheque", "enrol",
            "Australia", "Melbourne", "Canberra", "The",
        ] {
            assert!(s.is_correct(w).unwrap(), "{w} should be accepted");
        }
        // Words the SCOWL en_AU list deliberately does not carry (Australian usage is "program").
        assert!(!s.is_correct("programme").unwrap());
        for w in ["teh", "recieve", "definately", "seperate", "occurence"] {
            assert!(!s.is_correct(w).unwrap(), "{w} should be flagged");
        }
    }

    #[test]
    fn suggestions_personal_and_ignore() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Speller::default();
        s.load_personal(dir.path());
        assert!(s.suggest("teh", 5).unwrap().contains(&"the".to_string()));
        assert!(!s.is_correct("Spaark").unwrap());
        s.add("Spaark").unwrap();
        assert!(s.is_correct("Spaark").unwrap());
        let saved = fs::read_to_string(dir.path().join(PERSONAL_FILE)).unwrap();
        assert!(saved.ends_with("Spaark\n"));
        let mut fresh = Speller::default();
        fresh.load_personal(dir.path());
        assert!(fresh.is_correct("Spaark").unwrap());
        assert!(!fresh.is_correct("Zorblax").unwrap());
        fresh.ignore("Zorblax");
        assert!(fresh.is_correct("Zorblax").unwrap());
        assert_eq!(fresh.misspelled(&["teh".into(), "teh".into(), "the".into()]).unwrap(), vec!["teh"]);
    }
}
