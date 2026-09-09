## Design Notes
The app will be called "AML", with a colour pallette of the follownig **Hex Codes:** #006078 #82BAC4, #FAEFED, #FFD4D1, #E37C78. Limit fonts to; Arial, Times New Roman and a few others which meet the cleanness of this project.

## Purpose
I want an app to work on research, creative and academic writing. Taking inspiration from numerous apps which I currently use for different purposes. The app needs to be highly functional and be packed full of features.
## Non-negotiable
- Need to be an installable program on MacOS and Windows. Not browser-based.
	- Consider a language which can allow builds to be built for both operating systems.
- Syncs with local NAS through Syncthing, so I can use it across any device in my network. This includes functional version control.
	- I am using a Asustor DRIVESTOR 2 Pro Gen2 2 Bay NAS.
- The app must be able to handle text and images at minimum.
- Australian English spell check and a word count.
- A way to display the "Vault" - as in, all the files within the NAS folder which the app will be reading/writing, so that files can be opened and closed with ease.
	- The files should be groupable too for organisational and viewing purposes - I work on numerous things such as; creative writing projects, academic projects, work and software design projects. I want to be able to visualise these in clusters or at least groupings which I plan to apply.
	- Please do not call it a vault though, that's an Obsidian term. Give me options to come up with my own.
- Develop-ability: I will have new ideas that I want to be able to add to this project. So keep in mind to produce documentation to allow AI coding engagement to be as seamless as possible with mapping the concept and build.
## Inspiration for features
1. Obsidian (functionality & file format .md)
	1. **Markdown storage** — every note is a plain `.md` file on disk, no proprietary database, works with any text editor, fully offline
	2. **Daily notes / templates** — one-click journaling with reusable templates
	3. **Tags and nested tags** for cross-cutting organization/search.
	4. **Full-text search** with operators (path, tag, file, regex)
	5. **Quick Switcher** — fuzzy-search command palette to jump to any note instantly
2. Typora (style/design)
	1. **Seamless live preview / WYSIWYG-style Markdown** — headings, bold, tables etc. render inline as you type; no split-pane, no mode switching
	2. **Syntax fades in/out** — Markdown symbols (`#`, `**`) only appear when your cursor is on that line
	3. **Outline panel** — auto-generated document outline/table of contents for navigation
	4. **File tree + "articles" panel** — lightweight project/folder browsing without being a full PKM tool
	5. **Focus Mode and Typewriter Mode** — dims all but the current sentence/paragraph, or keeps the active line centered
	6. **Custom CSS themes** — full visual restyling without touching app code
	7. **Spell check, auto-pair brackets/quotes/markdown symbols** - Always default to Australian English
3. Reedsy Editor (functionality)
	1. **Distraction-free manuscript editor** with automatic formatting carried over from paste/import
	2. **Option to automatic professional typesetting** — pick a designer-made theme and the tool typesets the whole book automatically (no manual layout work)
	3. **One-click export** to print-ready PDF (IngramSpark/KDP-compliant) and clean EPUB/MOBI
	4.  **Planning & outlining tools** — the newer "Studio" rebrand added dedicated planning boards (character/plot notes) ahead of drafting, not just a linear editor
		1. This might best function as separate "types" of note files which may be templated and colour coded.
	5. **Goal-setting** — daily word-count goals and overall manuscript targets with progress tracking
	6. **References and Endnotes support**
4. **Scrivener**
    - **Binder** — hierarchical project tree for chapters/scenes/research all in one project file
    - **Corkboard** — visual index-card view of every scene/chapter for outlining and restructuring
    - **Scrivenings mode** — temporarily stitches multiple documents into one continuous view for editing
    - **Outliner mode** with metadata columns (label, status, word count targets per scene)
    - **Research pane** — store PDFs, images, and reference notes alongside the manuscript
    - **Snapshots** — versioning/rollback of individual documents
    - **Compile** — highly configurable export engine that outputs to dozens of formats/styles from one project

## Nice to have
1. A way to create diagrams or conceptual graphs in the notes.