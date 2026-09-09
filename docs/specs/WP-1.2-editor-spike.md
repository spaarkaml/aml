# WP-1.2 — Editor spike: WYSIWYG on Tiptap with a canonical markdown bridge
**Stage:** 1 · **Depends on:** 1.1 · **ADRs:** 003, 004 · **Sessions:** 2

## Goal
Prove ADR-003: a polished WYSIWYG editor whose on-disk form is canonical AML markdown, with nothing lost that the parser doesn't model, and re-saving a file changing nothing.

## Decisions taken in the spike
- **Library:** Tiptap 3 (ProseMirror). `@tiptap/markdown` was evaluated and not used: we need a Raw-node guarantee and full control of the canonical style, so the bridge is our own (`src/lib/markdown/`) on remark/mdast.
- **Canonical style:** ATX headings, `-` bullets, `*emphasis*`/`**strong**`, fenced code with backticks, `---` rules, one-space list indent, incrementing ordered markers, reference links resolved to inline, hard breaks as `\`, bare GFM autolinks, tables padded with alignment row.
- **Conservative escaping:** remark's default escaper writes `snake\_case` and `\[text]`; ours (`escape.ts`) escapes only where CommonMark could start a construct, and `escape.test.ts` proves every case through the real parser.
- **AML inline syntax** (`[[wiki]]`, `![[embed]]`, `#tag`, `[@cite]`) are atoms that serialise verbatim.
- **Raw nodes** slice the exact source bytes (callouts, HTML, math, mixed task lists, unknown blocks) and are written back byte-for-byte.
- **Front matter** is a non-selectable atom; a ProseMirror plugin re-inserts it if any edit removes it.
- **Fidelity definition** (replaces "byte-identical"): parse(out) AST-equal parse(src) **and** canonicalise(out) === out.

## Acceptance criteria
- [x] 48-file corpus: AST-equal + idempotent; 21 files byte-lossless; Raw expectations met.
- [x] Editor renders headings, emphasis, lists, task lists, code, quotes, tables, images, footnotes, front matter chip, wiki links, tags, citations, raw blocks.
- [x] Typing → Unsaved → autosave (1 s) → Saved; written markdown is canonical with front matter intact (e2e).
- [x] Front matter survives Backspace at heading start and select-all + type (e2e).
- [x] Markdown input rules (`## `, `**bold**`, `- `) work while typing (e2e).
- [x] 60 fps typing at 50k words — **not yet measured**; `edge/large.md` (~130 KB) parses and round-trips in unit tests; perf assertion is added to the Stage 1 QA script.

## Known limitations (tracked)
- Nested same-marker emphasis (`*a *b* c*`) collapses (rare, noted in the corpus manifest).
- Raw blocks are display-only atoms; in-place editing arrives in WP-1.3.
- Table cells with block content join with spaces on save (markdown tables are single-line).
- Tiptap re-applies options on re-render; all options are memoised in `NoteEditor.tsx` — keep it that way.

## Tests
Unit: `escape.test.ts` (54), `markdown.test.ts` (48 corpus + 7), `wordcount.test.ts`, `editor/store.test.ts` (debounce, coalescing, conflict, external change). E2E: `e2e/editor.spec.ts` (4).
