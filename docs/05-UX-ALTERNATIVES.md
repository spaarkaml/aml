# AML — UX Alternatives

> **Decision 2026-09-09:** start from the recommended hybrid (Page + pinnable panels + Project tabs). Bryce is comfortable with a busier Desk-style screen, so the shipped default Layout pins the Folio Browser on the left; the bare Page is one shortcut away. Navigation between notes is the priority — see "Navigation requirements" at the end.

Three workspace models are on the table. They are not mutually exclusive in features — all three end up with the same panes — but they differ in **what the app looks like when you open it** and **where the writing happens**. A visual canvas of these (artboards you can edit) accompanies this document; the text here records the reasoning.

Shared design tokens: Paper `#FAEFED` ground, Teal `#006078` for structure and active states, Sea Glass `#82BAC4` for rules and quiet UI, Blush `#FFD4D1` for selection/current line, Coral `#E37C78` for accents only. Body text `#1F2A2E`. Editor default serif (Source Serif 4 / Times New Roman), UI sans (Inter / Arial).

---

## Option A — "Desk": three-pane workbench (Obsidian-shaped)

```
┌─────────────┬────────────────────────────────┬──────────────┐
│ Explorer    │                                │ Outline      │
│ Boundings │        Editor (tabs)           │ Backlinks    │
│ Tags        │                                │ Properties   │
│ Search      │                                │ Goals        │
└─────────────┴────────────────────────────────┴──────────────┘
```
- **Open state:** the Folio Browser on the left, editor centre, context on the right. Everything one click away.
- **Groupings:** Boundings appear as a section in the left rail; the Overview is a tab, not the home.
- **Strength:** fastest for research/knowledge work; all four inspirations' features have an obvious home.
- **Weakness:** busiest screen; "distraction-free" is a mode you enter, not the default.
- **Who it suits:** the academic / software-design half of your work.

## Option B — "Page": editor-first with slide-over panels (Typora-shaped)

```
┌──────────────────────────────────────────────────────────────┐
│  ◧                    Chapter Three                     ☰ ⓘ │
│                                                              │
│         The page, centred, ~70 characters wide.              │
│         Nothing else unless summoned.                        │
│                                                              │
│  ····························· 1,204 words · 63 % ·········· │
└──────────────────────────────────────────────────────────────┘
   Explorer / Binder slide in from the left (⌘1); Outline / Backlinks
   / Research slide in from the right (⌘2); both auto-hide on typing.
```
- **Open state:** the last note, alone, beautifully typeset. Panels are transient overlays with a blur behind.
- **Groupings:** the Overview is the "home" you land on when nothing is open — Projects and Boundings as large tiles/clusters.
- **Strength:** genuinely distraction-free by default; matches the Typora inspiration exactly; small screens (laptop) work well.
- **Weakness:** side-by-side workflows (research beside draft, corkboard beside note) need a "pin panel" gesture that turns it into Option A anyway.
- **Who it suits:** the creative-writing half; long drafting sessions.

## Option C — "Studio": project-centric, view-switching (Scrivener-shaped)

```
┌──────────┬───────────────────────────────────────────────────┐
│ Binder   │  [ Write | Corkboard | Outliner | Research | Compile ] │
│  Part I  │                                                   │
│   Ch 1   │        the selected view fills the stage          │
│   Ch 2   │                                                   │
│  Notes   │                                                   │
│  Research│                                                   │
└──────────┴───────────────────────────────────────────────────┘
```
- **Open state:** a Project (manuscript, thesis) with its Binder; the stage switches between views.
- **Groupings:** a Project *is* the grouping; the Folio-level Overview is a project picker (like Scrivener's start screen).
- **Strength:** best for long-form structure; Corkboard/Outliner/Stitch are first-class rather than bolted on.
- **Weakness:** loose notes (daily, research snippets, work notes) feel homeless; cross-project linking is less visible.
- **Who it suits:** manuscript and thesis periods.

---

## Recommendation: B as the default skin, A as a layout, C as a Project mode

Make the **layout** a first-class, saved state rather than a philosophy:

1. **Home = Overview** (from B/C): Projects and Boundings as clusters. Coloured by Type or Bounding. This is where "visualise my creative / academic / work / software things" lives.
2. **Writing = Page** (from B): opening a note lands you in the centred page. Panels slide over by default.
3. **Pin to make a Desk** (from A): any slid-over panel can be pinned; pinned panels persist as a named **Layout** (e.g. "Research", "Editing"). Layouts are per device, switchable from the palette.
4. **Projects add the Studio tabs** (from C): when the open note belongs to a Project, the top bar gains Write / Corkboard / Outliner / Research / Compile; the Binder replaces the Explorer in the left panel.

This gives one mental model ("the page is the centre; everything else is summoned or pinned") while keeping every inspiration's feature where its users expect it.

### Things to decide when you look at the canvas
- Do you want the top bar at all in Page mode, or a fully bare page with a hover-reveal bar?
- Overview tiles vs. a clustered "constellation" graph — the canvas shows both.
- Left rail icons (Explorer / Binder / Boundings / Tags / Search / History) vs. a single Explorer with sections.
- Status bar: always visible, or hover-reveal in Focus mode?

### Accessibility notes carried into tokens
- Coral never carries text; goal rings use Coral fill with a Teal label.
- Sea Glass is for 1 px rules and disabled icons only.
- Focus ring is 2 px Teal on Paper, 2 px Sea Glass on Ink (dark).
- Ink palette and both-mode contrast table are in ADR-010; approve on screen at Gate 0.
- All panes reachable by keyboard; every pane has a shortcut listed in its header on hover.


---

## Navigation requirements (from the decision)

Moving between notes must never need the mouse and never need more than two keystrokes:

| Need | Mechanism | Shortcut |
|---|---|---|
| Jump to any note by name | Quick Open (fuzzy over titles, aliases, headings, Bounding-scoped filter) | ⌘/Ctrl+O |
| Go back / forward through notes visited | Navigation history per tab | ⌘/Ctrl+[ and ] |
| See what's open | Tabs across the top of the page; ⌘/Ctrl+1–9 to switch | — |
| Browse structure | Folio Browser pinned (default "Desk" Layout) or slid over (⌘/Ctrl+Shift+E) | — |
| Follow a link | Click; ⌘/Ctrl+click opens in new tab; ⌘/Ctrl+Enter on the caret's link | — |
| Return to where you were | Breadcrumb `Overview › Bounding › Project › Note` in the top bar | — |
| Recent | Overview lists recents; Quick Open with empty query shows recents | — |
| Two notes at once | Split (⌘/Ctrl+\\) — right pane can hold a note, Outline, Backlinks, or Research | — |

Two shipped Layouts: **Desk** (Browser pinned left, nothing right) and **Page** (nothing pinned). Toggle with ⌘/Ctrl+Shift+L. Users can save more.
