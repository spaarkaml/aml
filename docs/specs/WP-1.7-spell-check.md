# WP-1.7 — Australian English spell check
**Stage:** 1 · **Depends on:** 1.2 · **ADRs:** 001, 009 · **Sessions:** 1

## Goal
Underline misspelled words as you write, using Australian English, with suggestions, a personal dictionary that follows the Folio, and sensible ignore rules — with no dependence on the OS spell checker (which is often set to US English).

## Design
- **Dictionary:** SCOWL en_AU Hunspell files (`src-tauri/resources/dict/en_AU.{aff,dic}`, version 2020.12.07 from the LibreOffice dictionaries repository; licence in `README_en_AU.txt` — SCOWL/BSD-style, redistribution permitted with the notice) embedded into the binary with `include_str!`. Note the list is deliberately Australian: `colour`, `organise`, `centre` pass; `programme` is not carried (Australian usage is `program`).
- **Checker (Rust, `spell.rs`):** `spellbook` (pure-Rust Hunspell implementation; no native library) parses the dictionary lazily on first use (~100 ms). `Speller` holds the dictionary, the personal words and a session ignore set. Commands: `spell_check(words) → misspelled subset`, `spell_suggest(word)`, `spell_add(word)`, `spell_ignore(word)`. The personal dictionary is `.aml/dictionary.txt`, one sorted word per line (merge-friendly per CLAUDE.md), loaded on Folio open and rewritten atomically on add.
- **Tokenising (`features/spell/tokenise.ts`):** words are `\p{L}` runs with inner apostrophes; possessives stripped. Skipped: code blocks, front matter, raw blocks, text under `code` or `link` marks, atoms (wiki links, tags, citations have no text), acronyms (all caps), CamelCase identifiers, single letters. Words with digits never match.
- **Editor plugin (`extensions/spell.ts`):** 400 ms after a document change it collects words, asks Rust only about words not yet judged (module-level cache), and dispatches a `DecorationSet` of `.aml-misspelled` inline decorations (wavy accent underline). The set is mapped through edits between runs. Right-click on an underlined word opens `SpellMenu` (suggestions, "Add … to dictionary", "Ignore for this session"); add/ignore clear the cache and re-run.
- **Toggle:** status-bar `en-AU ✓ / off` button and the palette command "Toggle Spell Check (en-AU)"; persisted per device (`aml.spell`). Off clears all underlines.
- **Dependencies:** `spellbook = "0.4"` (Rust) — justification: Hunspell-compatible, pure Rust, so the same binary works on macOS and Windows without shipping libhunspell.

## Acceptance criteria
- [x] 30 Australian spellings accepted, 5 classic errors flagged, `programme` documented as absent (Rust test).
- [x] Suggestions, personal dictionary round trip through `.aml/dictionary.txt`, session ignore (Rust test).
- [x] Tokeniser skips front matter, code, links, atoms, acronyms; positions map back to the doc (unit tests).
- [x] Typing `recieve teh` underlines both; choosing "the" replaces the word (e2e).
- [x] Add to dictionary clears the underline; the status-bar toggle turns checking off (e2e).
- [ ] 0 false positives on a 1,000-word Australian text. *(Manual with a real note; add words to the dictionary test if any appear.)*

## Lessons recorded
- Menu actions that run after a context menu closes must refocus the editor; the menu button had taken focus and later keystrokes went nowhere.
