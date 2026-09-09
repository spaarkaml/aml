# AML — Glossary & Naming

Consistent vocabulary is the cheapest quality control there is when code is AI-generated: every prompt, type name, UI label and doc uses the *same* word for the same thing. Pick the names below, then they are frozen in `CLAUDE.md`.

## 1. The root folder — decided: **Folio**

| Name | Family | Feel | Sample UI strings |
|---|---|---|---|
| **Folio** | Folios · Bounding (groups) · Folio Browser | Book-making, printerly; echoes the typesetting purpose | "Open Folio", "Bounding: Thesis" |

Decided 2026-09-09 (ADR-011). Rejected alternatives were Study, Library, Atelier, Commonplace, Stacks, Desk, Archive.

## 2. Groupings (Q10 still open for the automatic-cluster part)

| Mechanism | Suggested name | Storage |
|---|---|---|
| Physical folder with `project.aml.yaml` | **Project** | folder |
| Virtual, many-to-many, hand-curated | **Bounding** | `.aml/boundings.yaml` |
| Automatic by tag/link proximity | **Cluster** | derived, not stored |
| The visual arrangement of Projects/Boundings on the home screen | **Overview** | per-device state |

## 3. Domain terms (frozen once agreed)

| Term | Meaning | Not called |
|---|---|---|
| **Note** | Any `.md` file | document, page, file (in UI) |
| **Type** | Front-matter `type:` value selecting template + colour | kind, class |
| **Template** | A `.md` in `_templates/` with placeholders `{{date}}`, `{{title}}` | scaffold |
| **Daily** | A note of type `daily`, path `journal/YYYY/YYYY-MM-DD.md` | daily note (UI just says "Today") |
| **Link** | `[[Note]]`, `[[Note#Heading]]`, `[[Note|alias]]`, plus standard `[text](path.md)` | wikilink (internal only) |
| **Backlink** | Incoming Link listed on the target | — |
| **Tag** | `#tag` or `#parent/child` inline, or `tags:` in front matter | label |
| **Outline** | Heading tree of the open Note | TOC (reserved for exported TOC) |
| **Binder** | The ordered tree of Notes in a Project (Scrivener term, kept) | tree |
| **Card** | A Binder item shown on the Corkboard (title + synopsis) | index card |
| **Corkboard** | Card grid view of a Binder level | board |
| **Outliner** | Table view of a Binder with metadata columns | grid |
| **Stitch** *(Scrivenings)* | Multiple Notes shown as one continuous editable stream | scrivenings, composite |
| **Snapshot** | A full copy of a Note at a point in time (auto every 30 min, or labelled) | version, revision |
| **History** | The list of a Note's Snapshots | versions |
| **Compile** | Export a Project via a Preset | export (menu says "Compile / Export") |
| **Preset** | Saved compile configuration | profile |
| **Mode** | Paper (light) or Ink (dark) | theme, skin |
| **Book Design** | Typst template used by Compile | theme (avoid overloading) |
| **Goal** | Word-count target with a period or deadline | target |
| **Session** | Writing activity between app focus/blur, used for goals | — |
| **Research** | Non-markdown items (PDF, image, web clip) in a Project's `research/` folder | attachments |
| **Asset** | Image/file referenced by a Note, in `assets/` | attachment |
| **Focus Mode** | Dims everything but current paragraph/sentence | zen |
| **Typewriter Mode** | Keeps caret line vertically centred | — |
| **Quick Open** | Fuzzy switcher (⌘/Ctrl+O) | quick switcher |
| **Location** | A Folio's storage type: Synced (default; bundled Syncthing), Local, or Network (SMB, optional) | mode |
| **Paired** | A Synced Folio connected to the NAS's Syncthing | linked |
| **Appearance** | Settings panel for light/dark mode, colour tokens and fonts | theme |
| **Raw** | An editor node holding markdown the parser does not model, written back verbatim | unknown block |
| **Layout** | A saved arrangement of pinned panels (per device) | workspace |
| **Command Palette** | Fuzzy command runner (⌘/Ctrl+Shift+P) | — |

## 4. Reserved folder names inside a Folio

```
<Folio>/
  .aml/                 app data that lives with the Folio (config, snapshots, dictionary, boundings)
    snapshots/          Snapshot copies, mirrors the note tree
    boundings.yaml
    config.yaml         includes appearance: (colours, fonts, mode)
    dictionary.txt
  .stignore             Syncthing ignore file (OS junk, temp files); nothing derived lives in the Folio
  _templates/           note templates by Type
  journal/YYYY/         Daily notes
  <Project>/            any folder containing project.aml.yaml
    project.aml.yaml
    assets/             images for this project
    research/           PDFs, images, clips
    *.md
```
