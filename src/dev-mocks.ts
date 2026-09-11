/**
 * Loaded only when the app runs in a plain browser in dev (no Tauri runtime), i.e. for
 * Playwright e2e and quick UI work. Mocks every IPC command with an in-memory Folio.
 * Never imported in production; main.tsx guards it.
 */
import { mockIPC } from "@tauri-apps/api/mocks";
import type { FolioInfo, RecentFolio, TreeNode } from "@/ipc";

const MOCK_ROOT = "/mock/Writing";

function node(
  name: string,
  path: string,
  kind: TreeNode["kind"],
  children: TreeNode[] = [],
): TreeNode {
  return {
    name,
    path,
    kind,
    mtime: 1_700_000_000_000,
    size: kind === "folder" ? 0 : 120,
    children,
  };
}

const notes = new Map<string, { text: string; mtime: number }>([
  [
    "Thesis/chapters/03 Influence networks.md",
    {
      text: "---\ntype: chapter\nstatus: drafting\n---\n\n# Influence networks\n\nThe distinction between persuasion and manipulation is rarely visible from inside a single message. See [[04 Methods]] and [@rid2020, p. 41]. #thesis/ch3\n\n## Three properties\n\n- [ ] repetition without attribution\n- [x] collapse of the interval\n\n> [!note] Callout\n> Held verbatim.\n",
      mtime: 1_700_000_000_000,
    },
  ],
  ["Inbox.md", { text: "Quick thoughts.\n", mtime: 1_700_000_000_000 }],
  [
    "The Salt Road/part one/01 Arrival.md",
    {
      text: "---\nsynopsis: She reaches the salt flats at dusk.\nstatus: drafting\nlabel: Scene\n---\n\n# Arrival\n\nThe flats went on past where the light gave out, and she walked into them anyway.\n",
      mtime: 1_700_000_000_000,
    },
  ],
  [
    "The Salt Road/part one/02 The road.md",
    {
      text: "---\nstatus: drafting\n---\n\n# The road\n\nThree days east, and the water ran out on the second.\n",
      mtime: 1_700_000_000_000,
    },
  ],
  [
    "The Salt Road/part two/03 Salt.md",
    {
      text: "---\nstatus: revised\nlabel: Scene\n---\n\n# Salt\n\nWhat the lake left behind was worth more than the crossing cost.\n",
      mtime: 1_700_000_000_000,
    },
  ],
  [
    "journal/2026-09-09.md",
    {
      text: "# Tuesday\n\nReworked the interviews section of 04 Methods; the methodology needs a table. #thesis #journal\n",
      mtime: 1_700_000_000_000,
    },
  ],
  [
    "Thesis/chapters/04 Methods.md",
    {
      text: "---\naliases: [methodology, interviews]\n---\n\n# Methods\n\n## Interview protocol\n\nText.\n",
      mtime: 1_700_000_000_000,
    },
  ],
]);

/* ---- links (WP-2.2): a small mirror of Rust's resolution and rename rules ---- */
function mockParentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
function mockStem(p: string): string {
  return (p.split("/").pop() ?? p).replace(/\.md$/i, "").toLowerCase();
}
function mockNormalise(dir: string, target: string): string {
  const parts = dir ? dir.split("/") : [];
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}
function mockRelative(fromDir: string, toPath: string): string {
  const a = fromDir ? fromDir.split("/") : [];
  const b = toPath.split("/");
  let common = 0;
  while (common < a.length && a[common] === b[common]) common++;
  return [...a.slice(common).map(() => ".."), ...b.slice(common)].join("/");
}
function mockResolve(from: string, target: string, kind: string): string | null {
  const paths = [...notes.keys()];
  if (kind === "md") {
    const p = mockNormalise(mockParentDir(from), target).toLowerCase();
    return paths.find((x) => x.toLowerCase() === p) ?? null;
  }
  const bare = target.replace(/\.md$/i, "");
  if (bare.includes("/")) {
    const want = `${bare}.md`.toLowerCase();
    return (
      paths.find((x) => x.toLowerCase() === want || x.toLowerCase().endsWith(`/${want}`)) ?? null
    );
  }
  const same = paths.filter((x) => mockStem(x) === bare.toLowerCase());
  same.sort((x, y) => x.length - y.length);
  return same.find((x) => mockParentDir(x) === mockParentDir(from)) ?? same[0] ?? null;
}
function mockRenamePreview(from: string, to: string) {
  const moved = new Map<string, string>();
  if (notes.has(from)) moved.set(from, to);
  else
    for (const p of notes.keys())
      if (p.startsWith(`${from}/`)) moved.set(p, to + p.slice(from.length));
  const out: Array<{
    path: string;
    newPath: string;
    edits: Array<{ line: number; before: string; after: string }>;
  }> = [];
  let links = 0;
  for (const [path, n] of notes) {
    const edits: Array<{ line: number; before: string; after: string }> = [];
    n.text.split("\n").forEach((before, i) => {
      let after = before.replace(
        /\[\[([^\]|#]+)((?:#[^\]|]*)?(?:\|[^\]]*)?)\]\]/g,
        (m, t: string, rest: string) => {
          const dest = moved.get(mockResolve(path, t.trim(), "wiki") ?? "");
          if (!dest) return m;
          links++;
          const stem = (dest.split("/").pop() ?? dest).replace(/\.md$/i, "");
          return `[[${t.includes("/") ? dest.replace(/\.md$/i, "") : stem}${rest}]]`;
        },
      );
      after = after.replace(/\]\(([^)\s]+\.md)((?:#[^)]*)?)\)/g, (m, t: string, rest: string) => {
        const dest = moved.get(mockResolve(path, decodeURIComponent(t), "md") ?? "");
        if (!dest) return m;
        links++;
        return `](${mockRelative(mockParentDir(moved.get(path) ?? path), dest).replace(/ /g, "%20")}${rest})`;
      });
      if (after !== before) edits.push({ line: i + 1, before, after });
    });
    if (edits.length) out.push({ path, newPath: moved.get(path) ?? path, edits });
  }
  return { from, to, notes: out, links };
}

/* ---- search (WP-2.5): a reduced mirror of the Rust query language. Words,
   phrases, /regex/, `-` exclusions and field terms are modelled and ANDed;
   OR and parentheses are not — the real evaluator is the one under test. */
interface MockTerm {
  negated: boolean;
  field: string | null;
  kind: "word" | "phrase" | "regex";
  value: string;
}

const TERM_RE =
  /(-?)(?:([A-Za-z_][A-Za-z0-9_]{0,23}):(?!\/\/))?(?:"([^"]*)"|\/((?:\\.|[^/])+)\/[A-Za-z]*|([^\s"]+))/g;

function mockTerms(q: string): MockTerm[] {
  const out: MockTerm[] = [];
  for (const m of q.matchAll(TERM_RE)) {
    const negated = m[1] === "-";
    const field = m[2] ?? null;
    if (m[3] !== undefined) out.push({ negated, field, kind: "phrase", value: m[3] });
    else if (m[4] !== undefined) out.push({ negated, field, kind: "regex", value: m[4] });
    else {
      const word = (m[5] ?? "").replace(/^\(+|\)+$/g, "");
      if (!word || (!field && /^(or|and)$/i.test(word))) continue;
      out.push({ negated, field, kind: "word", value: word });
    }
  }
  return out.filter((t) => t.field !== null || t.value !== "");
}

function mockTermRegex(t: MockTerm): RegExp | null {
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    if (t.kind === "regex") return new RegExp(t.value, "gu");
    if (t.kind === "phrase") return new RegExp(esc(t.value), "giu");
    // Words match at word starts, and the whole word is highlighted.
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc(t.value)}[\\p{L}\\p{N}]*`, "giu");
  } catch {
    return null;
  }
}

function mockTitle(path: string, text: string): string {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const title = /^title:\s*(.+)$/m
    .exec(fm)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  return title || (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function mockProps(text: string): Array<[string, string]> {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const out: Array<[string, string]> = [];
  for (const line of fm.split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (m?.[1] && m[2]) out.push([m[1].toLowerCase(), m[2].trim().toLowerCase()]);
  }
  return out;
}

function mockTagsOf(text: string): string[] {
  const tags = new Set<string>();
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  for (const t of /^tags:\s*\[(.*)\]$/m.exec(fm)?.[1]?.split(",") ?? [])
    if (t.trim()) tags.add(t.trim().toLowerCase());
  for (const m of text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu))
    if (m[1] && !/^\d+$/.test(m[1])) tags.add(m[1].replace(/\/+$/, "").toLowerCase());
  return [...tags];
}

function mockTermMatches(t: MockTerm, path: string, title: string, text: string): boolean {
  if (t.field === null) {
    const re = mockTermRegex(t);
    return re ? re.test(text) || re.test(title) : false;
  }
  const v = t.value.toLowerCase();
  switch (t.field) {
    case "path":
      return path.toLowerCase().includes(v);
    case "file":
      return (path.split("/").pop() ?? path).toLowerCase().includes(v);
    case "title":
      return title.toLowerCase().includes(v);
    case "tag": {
      const want = v.replace(/^#/, "").replace(/^\/|\/$/g, "");
      return mockTagsOf(text).some((x) => x === want || x.startsWith(`${want}/`));
    }
    case "has":
      if (v === "image") return text.includes("![");
      if (v === "link") return text.includes("[[") || text.includes("](");
      if (v === "task") return text.includes("- [ ]") || text.includes("- [x]");
      if (v === "code") return text.includes("```") || text.includes("~~~");
      if (v === "table") return text.split("\n").some((l) => l.trimStart().startsWith("|"));
      return false;
    case "bounding":
      return boundings.some((b) => b.name.toLowerCase() === v && b.notes.includes(path));
    default:
      return mockProps(text).some(
        ([k, pv]) => k === t.field && (pv === v || (v === "" && pv !== "")),
      );
  }
}

function mockSearchQuery(query: string, limit: number) {
  const terms = mockTerms(query);
  for (const t of terms)
    if (t.kind === "regex" && !mockTermRegex(t))
      return { results: [], total: 0, error: `bad regex: ${t.value}` };
  if (terms.length === 0) return { results: [], total: 0, error: null };
  const highlight = terms.filter((t) => !t.negated && t.field === null);
  const results: Array<{
    path: string;
    title: string;
    matches: number;
    snippets: Array<{ line: number; text: string; section: string | null }>;
  }> = [];
  for (const [path, n] of notes) {
    const title = mockTitle(path, n.text);
    if (!terms.every((t) => mockTermMatches(t, path, title, n.text) !== t.negated)) continue;
    let matches = 0;
    let section: string | null = null;
    let fence: string | null = null;
    const snippets: Array<{ line: number; text: string; section: string | null }> = [];
    n.text.split("\n").forEach((line, i) => {
      const t = line.trimStart();
      if (fence) {
        if (t.startsWith(fence)) fence = null;
      } else if (t.startsWith("```")) fence = "```";
      else if (t.startsWith("~~~")) fence = "~~~";
      else {
        const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(t);
        if (h?.[2]) section = h[2];
      }
      if (highlight.length === 0) {
        // A field-only query still shows where the note begins.
        if (snippets.length === 0 && t && !t.startsWith("---"))
          snippets.push({ line: i + 1, text: line.trim(), section });
        return;
      }
      const spans: Array<[number, number]> = [];
      for (const term of highlight) {
        const re = mockTermRegex(term);
        if (!re) continue;
        for (const m of line.matchAll(re)) if (m[0]) spans.push([m.index, m.index + m[0].length]);
      }
      if (spans.length === 0) return;
      matches += spans.length;
      if (snippets.length >= 3) return;
      spans.sort((a, b) => a[0] - b[0]);
      let out = "";
      let at = 0;
      for (const [from, to] of spans) {
        if (from < at) continue;
        out += `${line.slice(at, from)}«${line.slice(from, to)}»`;
        at = to;
      }
      snippets.push({ line: i + 1, text: `${out}${line.slice(at)}`.trim(), section });
    });
    results.push({ path, title, matches, snippets });
  }
  results.sort((a, b) => b.matches - a.matches || a.path.localeCompare(b.path));
  return { results: results.slice(0, limit), total: results.length, error: null };
}

/* ---- templates and Daily notes (WP-2.7): mirrors src-tauri/src/templates.rs ---- */
const templates = new Map<string, string>([
  [
    "daily",
    "---\ntype: daily\n---\n\n# {{date:dddd D MMMM YYYY}}\n\n## Today\n\nYesterday: [[{{yesterday}}]]\n",
  ],
  ["Scene", "---\ntype: scene\n---\n\n# {{title}}\n\nWritten {{date}}.\n"],
  // Declares two properties beyond `type`, which is what makes them a chapter's own fields.
  ["Chapter", "---\ntype: chapter\nstatus: drafting\npov:\n---\n\n# {{title}}\n"],
]);

/* ---- note types (WP-3.3): mirrors src-tauri/src/note_types.rs ---- */
const TYPES_KEY = "aml.mock.types";
const TYPE_PALETTE = ["#006078", "#e37c78", "#82bac4", "#7a5c9e", "#4c8b5a", "#c08a2e"];

function typeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function typeName(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function typeColour(id: string): string {
  let hash = 0;
  for (const b of new TextEncoder().encode(id)) hash = (Math.imul(hash, 31) + b) >>> 0;
  return TYPE_PALETTE[hash % TYPE_PALETTE.length] as string;
}

interface MockSavedType {
  name?: string;
  colour?: string;
  icon?: string;
}

function savedTypes(): Record<string, MockSavedType> {
  try {
    const raw = localStorage.getItem(TYPES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Front-matter keys of a template, in order, without `type` — the type's own fields. */
function templateFields(text: string): string[] {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  return fm
    .split("\n")
    .filter((l) => l && !/^\s/.test(l))
    .map((l) => l.split(":")[0]?.trim() ?? "")
    .filter((k) => k && k !== "type");
}

function mockTypesByNote(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, n] of notes) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(n.text)?.[1] ?? "";
    const id = typeSlug(/^type:\s*(.+)$/m.exec(fm)?.[1]?.replace(/["']/g, "") ?? "");
    if (id) out[path] = id;
  }
  return out;
}

function mockTypes() {
  const saved = savedTypes();
  const counts: Record<string, number> = {};
  for (const id of Object.values(mockTypesByNote())) counts[id] = (counts[id] ?? 0) + 1;

  const ids = new Set<string>(Object.keys(saved));
  for (const text of templates.values()) {
    const id = typeSlug(/^type:\s*(.+)$/m.exec(text)?.[1] ?? "");
    if (id) ids.add(id);
  }
  for (const id of Object.keys(counts)) ids.add(id);

  return [...ids]
    .map((id) => {
      const s = saved[id];
      const entry = [...templates.entries()].find(
        ([, text]) => typeSlug(/^type:\s*(.+)$/m.exec(text)?.[1] ?? "") === id,
      );
      return {
        id,
        name: s?.name ?? typeName(id),
        colour: s?.colour ?? typeColour(id),
        icon: s?.icon ?? "",
        template: entry?.[0] ?? null,
        fields: entry ? templateFields(entry[1]) : [],
        notes: counts[id] ?? 0,
        custom: s !== undefined,
      };
    })
    .sort((a, b) => b.notes - a.notes || a.name.localeCompare(b.name));
}

const MOCK_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MOCK_MONTHS = [
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

function mockDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}
function mockIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mockShift(iso: string, n: number): string {
  const d = mockDate(iso);
  d.setDate(d.getDate() + n);
  return mockIso(d);
}
function mockFormat(iso: string, fmt: string): string {
  const d = mockDate(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const tokens: Array<[string, () => string]> = [
    ["YYYY", () => String(d.getFullYear())],
    ["YY", () => pad(d.getFullYear() % 100)],
    ["MMMM", () => MOCK_MONTHS[d.getMonth()] ?? ""],
    ["MMM", () => (MOCK_MONTHS[d.getMonth() ?? 0] ?? "").slice(0, 3)],
    ["MM", () => pad(d.getMonth() + 1)],
    ["M", () => String(d.getMonth() + 1)],
    ["dddd", () => MOCK_WEEKDAYS[d.getDay()] ?? ""],
    ["ddd", () => (MOCK_WEEKDAYS[d.getDay()] ?? "").slice(0, 3)],
    ["DD", () => pad(d.getDate())],
    ["D", () => String(d.getDate())],
  ];
  let out = "";
  let rest = fmt;
  outer: while (rest) {
    for (const [token, f] of tokens) {
      if (rest.startsWith(token)) {
        out += f();
        rest = rest.slice(token.length);
        continue outer;
      }
    }
    out += rest[0];
    rest = rest.slice(1);
  }
  return out;
}

/** Unknown placeholders are left verbatim, exactly as Rust leaves them. */
function mockRender(text: string, vars: { title: string; date: string; time: string }): string {
  return text.replace(/\{\{([^}]*)\}\}/g, (whole, body: string) => {
    const [rawName, ...rest] = body.split(":");
    const name = (rawName ?? "").trim();
    const fmt = rest.length > 0 ? rest.join(":").trim() : null;
    const shifted = (n: number) => mockShift(vars.date, n);
    if (name === "title" && !fmt) return vars.title;
    if (name === "time" && !fmt) return vars.time;
    if (name === "date") return fmt ? mockFormat(vars.date, fmt) : vars.date;
    if (name === "yesterday") return fmt ? mockFormat(shifted(-1), fmt) : shifted(-1);
    if (name === "tomorrow") return fmt ? mockFormat(shifted(1), fmt) : shifted(1);
    return whole;
  });
}

const DAILY_RE = /(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/;

function mockDailyDates(): string[] {
  const dir = `${mockDailyFolder()}/`;
  const out = new Set<string>();
  for (const path of notes.keys()) {
    const m = path.startsWith(dir) ? DAILY_RE.exec(path) : null;
    if (m?.[1]) out.add(m[1]);
  }
  return [...out].sort().reverse();
}

/* ---- preferences (WP-3.10): the other half of .aml/config.yaml ---- */
const PREFS_KEY = "aml.mock.preferences";
const DEFAULT_DAILY_FOLDER = "journal";

/** Mirrors `templates::daily_folder`: tidied, or refused for anything that leaves the Folio. */
function mockCleanFolder(value: string | null): string | null {
  const cleaned = (value ?? "")
    .replace(/\\/g, "/")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!cleaned || cleaned.split("/").some((p) => !p || p === "." || p === "..")) return null;
  return cleaned;
}

interface MockPreferences {
  dailyFolder: string | null;
  dailyGoal: number | null;
}

const EMPTY_PREFS: MockPreferences = { dailyFolder: null, dailyGoal: null };

function mockPreferences(): MockPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...EMPTY_PREFS, ...JSON.parse(raw) } : { ...EMPTY_PREFS };
  } catch {
    return { ...EMPTY_PREFS };
  }
}

function mockDailyFolder(): string {
  return mockCleanFolder(mockPreferences().dailyFolder) ?? DEFAULT_DAILY_FOLDER;
}

/** The mock tree is nested, so a note in a new year folder needs that folder first. */
function ensureFolder(path: string): void {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (dir && !findNode(state.tree, dir)) insertNode(node(parts[i - 1] ?? dir, dir, "folder"));
  }
}

/* ---- Boundings and Projects (WP-2.8): the shape of src-tauri/src/boundings.rs ---- */
interface MockBounding {
  id: string;
  name: string;
  colour: string;
  icon: string;
  notes: string[];
}

const BOUNDING_PALETTE = ["#006078", "#e37c78", "#82bac4", "#7a5c9e", "#4c8b5a", "#c08a2e"];

const boundings: MockBounding[] = [
  {
    id: "academic",
    name: "Academic",
    colour: "#006078",
    icon: "🎓",
    notes: ["Thesis/chapters/03 Influence networks.md", "Thesis/chapters/04 Methods.md"],
  },
];

function mockSlug(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bounding";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

function mockBounding(id: string): MockBounding {
  const b = boundings.find((x) => x.id === id);
  if (!b) throw { kind: "notFound", detail: id };
  return b;
}

/** Mocks must mirror the real commands' reference semantics: hand back copies. */
function boundingsCopy(): MockBounding[] {
  return boundings.map((b) => ({ ...b, notes: [...b.notes] }));
}

function mockRemapBoundings(from: string, to: string): void {
  for (const b of boundings)
    b.notes = b.notes.map((n) =>
      n === from ? to : n.startsWith(`${from}/`) ? to + n.slice(from.length) : n,
    );
}

/* ---- appearance (WP-3.2): stands in for .aml/config.yaml ----
   Kept in localStorage rather than a module variable, because the real command writes a file
   in the Folio: settings have to still be there after a reload. */
const APPEARANCE_KEY = "aml.mock.config";

interface MockAppearance {
  mode: string | null;
  uiFont: string | null;
  editorFont: string | null;
  measure: number | null;
  leading: number | null;
  paragraphSpacing: number | null;
  paper: Record<string, string>;
  ink: Record<string, string>;
}

const EMPTY_APPEARANCE: MockAppearance = {
  mode: null,
  uiFont: null,
  editorFont: null,
  measure: null,
  leading: null,
  paragraphSpacing: null,
  paper: {},
  ink: {},
};

function readAppearance(): MockAppearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    return raw ? { ...EMPTY_APPEARANCE, ...JSON.parse(raw) } : { ...EMPTY_APPEARANCE };
  } catch {
    return { ...EMPTY_APPEARANCE };
  }
}

/* ---- Projects (WP-5.1–5.3, 5.8): the shape of src-tauri/src/project.rs ---- */

interface MockManifest {
  title: string;
  target: number | null;
  deadline: string | null;
  binder: string[];
  exclude: string[];
}

const manifests = new Map<string, MockManifest>([
  [
    "The Salt Road",
    {
      title: "The Salt Road",
      target: 90_000,
      deadline: null,
      binder: [],
      exclude: [],
    },
  ],
]);

/** Words outside the front matter — the same rule the index uses. */
function mockWords(text: string): number {
  const body = /^---\n[\s\S]*?\n---\n?/.test(text)
    ? text.replace(/^---\n[\s\S]*?\n---\n?/, "")
    : text;
  return body.split(/\s+/).filter(Boolean).length;
}

function mockFm(text: string, key: string): string {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (!front) return "";
  const line = front.split("\n").find((l) => !/^\s/.test(l) && l.split(":")[0]?.trim() === key);
  const raw = line?.slice(line.indexOf(":") + 1).trim() ?? "";
  return raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2
    ? raw.slice(1, -1).replace(/\\"/g, '"')
    : raw;
}

/** Mirrors front_matter::set_keys: one line changes, everything else is left alone. */
function mockSetFm(text: string, pairs: Array<[string, string]>): string {
  const has = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const lines = has?.[1] ? (has[1] as string).split("\n") : [];
  const body = has ? text.slice(has[0].length) : text;
  for (const [key, raw] of pairs) {
    const value = raw.trim();
    const at = lines.findIndex((l) => !/^\s/.test(l) && l.split(":")[0]?.trim() === key);
    const quoted = /[:#]|^["'[{\-*&!|>%@`]|^(true|false|null|yes|no|on|off)$/i.test(value)
      ? `"${value.replace(/"/g, '\\"')}"`
      : value;
    if (at === -1 && value) lines.push(`${key}: ${quoted}`);
    else if (at !== -1 && value) lines[at] = `${key}: ${quoted}`;
    else if (at !== -1) lines.splice(at, 1);
  }
  return lines.length === 0 ? body : `---\n${lines.join("\n")}\n---\n${body}`;
}

function mockBinder(project: string) {
  const m = manifests.get(project);
  if (!m) throw { kind: "notFound", detail: project };
  const order = new Map(m.binder.map((rel, i) => [rel, i]));
  const relOf = (p: string) => p.slice(project.length + 1);
  const out: Array<Record<string, unknown>> = [];
  const walk = (children: TreeNode[], depth: number, excluded: boolean) => {
    const kept = [...children].filter((c) => c.kind !== "file");
    kept.sort((a, b) => {
      const ia = order.get(relOf(a.path)) ?? Number.MAX_SAFE_INTEGER;
      const ib = order.get(relOf(b.path)) ?? Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    for (const c of kept) {
      const rel = relOf(c.path);
      const include = !excluded && !m.exclude.includes(rel);
      const text = notes.get(c.path)?.text ?? "";
      out.push({
        path: c.path,
        rel,
        name: c.kind === "note" ? c.name.replace(/\.md$/i, "") : c.name,
        kind: c.kind,
        depth,
        include,
        words: c.kind === "note" ? mockWords(text) : 0,
        synopsis: mockFm(text, "synopsis"),
        label: mockFm(text, "label"),
        status: mockFm(text, "status"),
      });
      if (c.kind === "folder") walk(c.children, depth + 1, !include);
    }
  };
  walk(findNode(state.tree, project)?.children ?? [], 0, false);
  return out;
}

function mockProject(path: string) {
  const m = manifests.get(path);
  if (!m) throw { kind: "notFound", detail: path };
  return {
    path,
    name: path.split("/").pop() ?? path,
    title: m.title,
    target: m.target,
    deadline: m.deadline,
    binder: mockBinder(path),
  };
}

function mockProjectsList() {
  return [...manifests.keys()]
    .filter((path) => findNode(state.tree, path))
    .map((path) => {
      let notesUnder = 0;
      for (const p of notes.keys()) if (p.startsWith(`${path}/`)) notesUnder += 1;
      return { path, name: path.split("/").pop() ?? path, notes: notesUnder };
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

const index = { building: false, done: 0, total: 0, lastBuilt: 0, lastDurationMs: 0 };
function indexStatus() {
  return { notes: notes.size, ...index };
}

const RECENT_KEY = "aml.mock.recent";

/** The real `folio_recent` reads a file, so the mock has to survive a reload the same way. */
function loadRecent(): RecentFolio[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentFolio[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentFolio[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode: the mock just forgets, as a read-only disk would */
  }
}

const state: { folio: FolioInfo | null; tree: TreeNode[]; recent: RecentFolio[] } = {
  folio: null,
  tree: [
    node("Thesis", "Thesis", "folder", [
      node("chapters", "Thesis/chapters", "folder", [
        node("03 Influence networks.md", "Thesis/chapters/03 Influence networks.md", "note"),
        node("04 Methods.md", "Thesis/chapters/04 Methods.md", "note"),
      ]),
      node("research", "Thesis/research", "folder", [
        node("Rid 2020.pdf", "Thesis/research/Rid 2020.pdf", "file"),
      ]),
    ]),
    node("The Salt Road", "The Salt Road", "folder", [
      node("part one", "The Salt Road/part one", "folder", [
        node("01 Arrival.md", "The Salt Road/part one/01 Arrival.md", "note"),
        node("02 The road.md", "The Salt Road/part one/02 The road.md", "note"),
      ]),
      node("part two", "The Salt Road/part two", "folder", [
        node("03 Salt.md", "The Salt Road/part two/03 Salt.md", "note"),
      ]),
      node("Three.md", "The Salt Road/Three.md", "note"),
    ]),
    node("journal", "journal", "folder", [node("2026-09-09.md", "journal/2026-09-09.md", "note")]),
    node("Inbox.md", "Inbox.md", "note"),
  ],
  recent: loadRecent(),
};

function findNode(tree: TreeNode[], path: string): TreeNode | undefined {
  for (const n of tree) {
    if (n.path === path) return n;
    const hit = findNode(n.children, path);
    if (hit) return hit;
  }
  return undefined;
}

function siblingsOf(path: string): TreeNode[] | undefined {
  const i = path.lastIndexOf("/");
  if (i === -1) return state.tree;
  return findNode(state.tree, path.slice(0, i))?.children;
}

function sortNodes(list: TreeNode[]): void {
  list.sort((x, y) =>
    x.kind === "folder" && y.kind !== "folder"
      ? -1
      : x.kind !== "folder" && y.kind === "folder"
        ? 1
        : x.name.localeCompare(y.name),
  );
}

function insertNode(n: TreeNode): void {
  const list = siblingsOf(n.path);
  if (!list) throw { kind: "notFound", detail: n.path };
  list.push(n);
  sortNodes(list);
}

function removeNode(path: string): TreeNode | undefined {
  const list = siblingsOf(path);
  const i = list?.findIndex((n) => n.path === path) ?? -1;
  if (!list || i === -1) return undefined;
  return list.splice(i, 1)[0];
}

function remap(n: TreeNode, from: string, to: string): TreeNode {
  const path = to + n.path.slice(from.length);
  return {
    ...n,
    path,
    name: path.split("/").pop() ?? path,
    children: n.children.map((c) => remap(c, from, to)),
  };
}

// Spell-check mock: a handful of classic errors and US spellings are "misspelled".
const MISSPELLED = new Set(["teh", "recieve", "color", "organize", "definately"]);
const SUGGEST: Record<string, string[]> = {
  teh: ["the", "tea", "ten"],
  recieve: ["receive"],
  color: ["colour"],
  organize: ["organise"],
  definately: ["definitely"],
};
const added = new Set<string>();

// Sync mock: a tiny state machine standing in for the Syncthing sidecar.
const sync = {
  enabled: false,
  running: false,
  devices: [] as Array<{ id: string; name: string; connected: boolean; address: string }>,
  folders: [] as Array<{
    id: string;
    label: string;
    path: string;
    state: string;
    completion: number;
    needBytes: number;
    devices: string[];
    error: string | null;
  }>,
  pending: [] as Array<{ id: string; label: string; offeredBy: string; offeredByName: string }>,
};
function syncStatus() {
  return {
    ...sync,
    myId: sync.running ? "AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH" : null,
    version: sync.running ? "v2.1.5" : null,
    guiUrl: "http://127.0.0.1:41384/",
    error: null,
  };
}

export function installDevMocks(): void {
  // Exposed for e2e assertions on what the app wrote.
  (window as unknown as { __amlMockNotes: typeof notes }).__amlMockNotes = notes;
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "app_info":
        return {
          name: "AML",
          version: "0.0.0-browser",
          platform: "browser",
          arch: "mock",
          debug: true,
        };
      case "plugin:dialog|open":
        return MOCK_ROOT;
      case "plugin:dialog|message": {
        // confirm() compares the result with its OK label; always "click" OK in the mock.
        const buttons = a.buttons as { OkCancelCustom?: string[] } | string | undefined;
        return typeof buttons === "object" && buttons.OkCancelCustom
          ? buttons.OkCancelCustom[0]
          : "Ok";
      }
      case "entry_create_note": {
        const path = String(a.path);
        if (findNode(state.tree, path)) throw { kind: "alreadyExists", detail: path };
        notes.set(path, { text: "", mtime: Date.now() });
        insertNode(node(path.split("/").pop() ?? path, path, "note"));
        return { path, mtime: Date.now(), size: 0 };
      }
      case "entry_create_folder": {
        const path = String(a.path);
        if (findNode(state.tree, path)) throw { kind: "alreadyExists", detail: path };
        insertNode(node(path.split("/").pop() ?? path, path, "folder"));
        return null;
      }
      case "entry_rename": {
        const from = String(a.from);
        const to = String(a.to);
        mockRemapBoundings(from, to);
        const n = removeNode(from);
        if (!n) throw { kind: "notFound", detail: from };
        if (findNode(state.tree, to)) throw { kind: "alreadyExists", detail: to };
        insertNode(remap(n, from, to));
        for (const [p, v] of [...notes]) {
          if (p === from || p.startsWith(`${from}/`)) {
            notes.delete(p);
            notes.set(to + p.slice(from.length), v);
          }
        }
        return null;
      }
      case "entry_trash": {
        const path = String(a.path);
        if (!removeNode(path)) throw { kind: "notFound", detail: path };
        for (const p of [...notes.keys()])
          if (p === path || p.startsWith(`${path}/`)) notes.delete(p);
        for (const b of boundings)
          b.notes = b.notes.filter((n) => n !== path && !n.startsWith(`${path}/`));
        return null;
      }
      case "folio_current":
        return state.folio;
      case "folio_recent":
        return state.recent;

      case "folio_open":
      case "folio_create": {
        const path = String(a.path ?? MOCK_ROOT);
        if (path.endsWith("not-a-folio")) throw { kind: "notAFolio", detail: path };
        state.folio = { root: path, name: path.split("/").pop() ?? "Folio", noteCount: 5 };
        state.recent = [
          { path, name: state.folio.name, lastOpened: Date.now() },
          ...state.recent.filter((r) => r.path !== path),
        ];
        saveRecent(state.recent);
        return state.folio;
      }
      case "folio_close":
        state.folio = null;
        return null;
      case "folio_tree":
        if (!state.folio) throw { kind: "noFolioOpen" };
        // Fresh objects each call, as Rust returns them: in-place mutations above must not
        // hand the UI the same reference twice (React would see no change).
        return structuredClone(state.tree);
      case "folio_index": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const out: Array<{
          path: string;
          title: string;
          aliases: string[];
          headings: string[];
          mtime: number;
        }> = [];
        const walk = (nodes: TreeNode[]) => {
          for (const n of nodes) {
            if (n.kind === "folder") walk(n.children);
            else if (n.kind === "note") {
              const text = notes.get(n.path)?.text ?? "";
              const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
              const title = /^title:\s*(.+)$/m.exec(fm)?.[1]?.replace(/^["']|["']$/g, "");
              const aliases =
                /^aliases:\s*\[(.*)\]$/m
                  .exec(fm)?.[1]
                  ?.split(",")
                  .map((a) => a.trim().replace(/^["']|["']$/g, ""))
                  .filter(Boolean) ?? [];
              const headings = [...text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((m) => m[1] ?? "");
              out.push({
                path: n.path,
                title: title ?? n.name.replace(/\.md$/i, ""),
                aliases,
                headings,
                mtime: notes.get(n.path)?.mtime ?? n.mtime,
              });
            }
          }
        };
        walk(state.tree);
        return out;
      }
      case "note_read": {
        const path = String(a.path);
        const n = notes.get(path) ?? { text: "", mtime: 1 };
        return { path, text: n.text, mtime: n.mtime, size: n.text.length };
      }
      case "note_write": {
        const path = String(a.path);
        const mtime = Date.now();
        notes.set(path, { text: String(a.text), mtime });
        return { path, mtime, size: String(a.text).length };
      }
      case "asset_write": {
        const name = String(a.fileName);
        return {
          path: `assets/20260910-000000-${name}`,
          markdownPath: `assets/20260910-000000-${name}`,
          absolute: `/mock/assets/${name}`,
          size: 1,
        };
      }
      case "asset_import": {
        const name = String(a.source).split("/").pop() ?? "image.png";
        return {
          path: `assets/20260910-000000-${name}`,
          markdownPath: `assets/20260910-000000-${name}`,
          absolute: `/mock/assets/${name}`,
          size: 1,
        };
      }
      case "asset_resolve":
        return `/mock/${String(a.target)}`;
      case "spell_check": {
        const words = (a.words as string[]) ?? [];
        return words.filter((w) => MISSPELLED.has(w.toLowerCase()) && !added.has(w));
      }
      case "spell_suggest":
        return SUGGEST[String(a.word).toLowerCase()] ?? [];
      case "spell_add":
        added.add(String(a.word));
        return null;
      case "spell_ignore":
        added.add(String(a.word));
        return null;
      case "sync_status":
        return syncStatus();
      case "sync_enable":
        sync.enabled = true;
        sync.running = true;
        return syncStatus();
      case "sync_disable":
        sync.enabled = false;
        sync.running = false;
        return syncStatus();
      case "sync_add_device": {
        const id = String(a.deviceId).toUpperCase();
        if (id.length < 50)
          throw { kind: "invalidPath", detail: "That does not look like a Syncthing Device ID" };
        sync.running = true;
        sync.enabled = true;
        sync.devices = [
          { id, name: String(a.name || "NAS"), connected: true, address: "192.168.1.20:22000" },
        ];
        // The mock NAS immediately offers a folder, as a real one does after accepting us.
        sync.pending = [
          {
            id: "p6tn7-qnz4c",
            label: "Folio",
            offeredBy: id,
            offeredByName: String(a.name || "NAS"),
          },
        ];
        return syncStatus();
      }
      case "sync_remove_device":
        sync.devices = [];
        sync.pending = [];
        return syncStatus();
      case "sync_accept_folder":
        sync.pending = sync.pending.filter((p) => p.id !== a.folderId);
        sync.folders.push({
          id: String(a.folderId),
          label: String(a.label),
          path: String(a.path),
          state: "idle",
          completion: 100,
          needBytes: 0,
          devices: [String(a.deviceId)],
          error: null,
        });
        return syncStatus();
      case "sync_share_folder":
        sync.folders.push({
          id: "writing",
          label: String(a.label ?? "Writing"),
          path: String(a.path),
          state: "syncing",
          completion: 42,
          needBytes: 1024,
          devices: [String(a.deviceId)],
          error: null,
        });
        return syncStatus();
      case "sync_is_synced_path":
        return sync.folders.some((f) => String(a.path).startsWith(f.path));
      case "sync_log_tail":
        return ["[mock] syncthing v2.1.5 starting", "[mock] Ready to synchronize"];
      case "index_status":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return indexStatus();
      case "index_rebuild": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        index.building = true;
        index.done = 0;
        index.total = notes.size;
        // A mock build takes about a second so the status bar can be seen to change.
        const tick = () => {
          index.done += 1;
          if (index.done >= index.total) {
            index.building = false;
            index.lastBuilt = Date.now();
            index.lastDurationMs = 900;
          } else setTimeout(tick, 300);
        };
        setTimeout(tick, 300);
        return null;
      }
      case "index_search": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const q = String(a.query ?? "")
          .toLowerCase()
          .trim();
        if (!q) return [];
        return [...notes.entries()]
          .filter(([, n]) => n.text.toLowerCase().includes(q))
          .slice(0, Number(a.limit ?? 40))
          .map(([path, n]) => {
            const at = n.text.toLowerCase().indexOf(q);
            const snippet = `${n.text.slice(Math.max(0, at - 30), at)}«${n.text.slice(at, at + q.length)}»${n.text.slice(at + q.length, at + q.length + 30)}`;
            return { path, title: path.split("/").pop()?.replace(/\.md$/i, "") ?? path, snippet };
          });
      }
      case "link_resolve": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const from = String(a.from);
        return (a.links as Array<{ target: string; kind: string }>).map((l) =>
          mockResolve(from, l.target, l.kind),
        );
      }
      case "link_rename_preview":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockRenamePreview(String(a.from), String(a.to));
      case "link_rename_apply": {
        let applied = 0;
        for (const n of a.notes as ReturnType<typeof mockRenamePreview>["notes"]) {
          const cur = notes.get(n.newPath);
          if (!cur) continue;
          const lines = cur.text.split("\n");
          for (const e of n.edits) {
            if (lines[e.line - 1] === e.before) {
              lines[e.line - 1] = e.after;
              applied++;
            }
          }
          notes.set(n.newPath, { text: lines.join("\n"), mtime: Date.now() });
        }
        return applied;
      }
      case "search_query": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockSearchQuery(String(a.query ?? ""), Number(a.limit ?? 200));
      }
      case "boundings_list":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return boundingsCopy();
      case "bounding_create": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const name = String(a.name).trim();
        if (!name) throw { kind: "invalidPath", detail: "a Bounding needs a name" };
        const used = boundings.map((b) => b.colour);
        const created: MockBounding = {
          id: mockSlug(
            name,
            boundings.map((b) => b.id),
          ),
          name,
          colour:
            BOUNDING_PALETTE.find((c) => !used.includes(c)) ??
            (BOUNDING_PALETTE[boundings.length % BOUNDING_PALETTE.length] as string),
          icon: "",
          notes: [],
        };
        boundings.push(created);
        return { ...created, notes: [] };
      }
      case "bounding_update": {
        const b = mockBounding(String(a.id));
        if (typeof a.name === "string" && a.name.trim()) b.name = a.name.trim();
        if (typeof a.colour === "string") b.colour = a.colour;
        if (typeof a.icon === "string") b.icon = [...a.icon].slice(0, 2).join("");
        return boundingsCopy();
      }
      case "bounding_delete": {
        const i = boundings.findIndex((b) => b.id === String(a.id));
        if (i === -1) throw { kind: "notFound", detail: String(a.id) };
        boundings.splice(i, 1);
        return boundingsCopy();
      }
      case "bounding_add": {
        const b = mockBounding(String(a.id));
        for (const p of a.paths as string[]) if (!b.notes.includes(p)) b.notes.push(p);
        return boundingsCopy();
      }
      case "bounding_remove": {
        const b = mockBounding(String(a.id));
        b.notes = b.notes.filter((n) => !(a.paths as string[]).includes(n));
        return boundingsCopy();
      }
      case "projects_list":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockProjectsList();
      case "project_read":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockProject(String(a.path));
      case "project_create": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const path = String(a.path);
        if (manifests.has(path)) throw { kind: "alreadyExists", detail: path };
        if (!findNode(state.tree, path)) {
          insertNode(node(path.split("/").pop() ?? path, path, "folder"));
        }
        manifests.set(path, {
          title: String(a.title || "").trim() || (path.split("/").pop() ?? path),
          target: null,
          deadline: null,
          binder: [],
          exclude: [],
        });
        return mockProject(path);
      }
      case "project_write": {
        const path = String(a.path);
        const m = manifests.get(path);
        if (!m) throw { kind: "notFound", detail: path };
        if (typeof a.title === "string" && a.title.trim()) m.title = a.title.trim();
        if (typeof a.target === "number") m.target = a.target > 0 ? a.target : null;
        if (typeof a.deadline === "string") m.deadline = a.deadline.trim() || null;
        return mockProject(path);
      }
      case "project_order": {
        const path = String(a.path);
        const m = manifests.get(path);
        if (!m) throw { kind: "notFound", detail: path };
        const next: string[] = [];
        for (const item of [...(a.order as string[]), ...m.binder]) {
          if (item && !next.includes(item)) next.push(item);
        }
        m.binder = next;
        return mockProject(path);
      }
      case "project_include": {
        const path = String(a.path);
        const m = manifests.get(path);
        if (!m) throw { kind: "notFound", detail: path };
        const item = String(a.item);
        if (a.include) m.exclude = m.exclude.filter((p) => p !== item);
        else if (!m.exclude.includes(item)) m.exclude.push(item);
        return mockProject(path);
      }
      case "project_card_write": {
        const notePath = String(a.note);
        const current = notes.get(notePath);
        if (!current) throw { kind: "notFound", detail: notePath };
        const pairs: Array<[string, string]> = [];
        for (const key of ["synopsis", "label", "status"] as const) {
          if (typeof a[key] === "string") pairs.push([key, String(a[key])]);
        }
        notes.set(notePath, { text: mockSetFm(current.text, pairs), mtime: Date.now() });
        return mockProject(String(a.path));
      }
      case "project_of_note": {
        const path = String(a.path);
        const owners = [...manifests.keys()].filter((p) => path.startsWith(`${p}/`));
        return owners.sort((x, y) => y.length - x.length)[0] ?? null;
      }
      case "appearance_read":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return readAppearance();
      case "appearance_write": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a.appearance));
        return null;
      }
      case "types_list":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockTypes();
      case "types_by_note":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockTypesByNote();
      case "type_write": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const t = a.type as { id: string; name: string; colour: string; icon: string };
        const id = typeSlug(t.id);
        if (!id) throw { kind: "invalidPath", detail: t.id };
        const saved = savedTypes();
        const entry: MockSavedType = {};
        if (t.name.trim() && t.name.trim() !== typeName(id)) entry.name = t.name.trim();
        if (t.colour && t.colour !== typeColour(id)) entry.colour = t.colour;
        if (t.icon) entry.icon = t.icon;
        // Only decisions are remembered; a type back at its defaults leaves the file.
        if (Object.keys(entry).length === 0) delete saved[id];
        else saved[id] = entry;
        localStorage.setItem(TYPES_KEY, JSON.stringify(saved));
        return mockTypes();
      }
      case "preferences_read":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockPreferences();
      case "preferences_write": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const asked = ((a.preferences as MockPreferences).dailyFolder ?? "").trim();
        const cleaned = mockCleanFolder(asked);
        if (asked && !cleaned) throw { kind: "invalidPath", detail: asked };
        const goal = (a.preferences as MockPreferences).dailyGoal ?? 0;
        const prefs: MockPreferences = {
          dailyFolder: cleaned,
          dailyGoal: goal > 0 ? Math.round(goal) : null,
        };
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        return prefs;
      }
      case "templates_list": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        return [...templates.entries()]
          .map(([name, text]) => ({
            name,
            path: `_templates/${name}.md`,
            noteType: /^---\n(?:[\s\S]*?\n)?type:\s*(\S+)/.exec(text)?.[1] ?? null,
          }))
          .sort((x, y) => x.name.toLowerCase().localeCompare(y.name.toLowerCase()));
      }
      case "note_from_template": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const path = String(a.path);
        if (notes.has(path)) throw { kind: "alreadyExists", detail: path };
        const vars = a.vars as { title: string; date: string; time: string };
        const text = mockRender(templates.get(String(a.template)) ?? "", vars);
        notes.set(path, { text, mtime: Date.now() });
        ensureFolder(mockParentDir(path));
        insertNode(node(path.split("/").pop() ?? path, path, "note"));
        return { path, mtime: Date.now(), size: text.length };
      }
      case "daily_note": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const date = String(a.date);
        const year = date.slice(0, 4);
        const dir = mockDailyFolder();
        const existing = [`${dir}/${year}/${date}.md`, `${dir}/${date}.md`].find((p) =>
          notes.has(p),
        );
        if (existing) return { path: existing, created: false };
        const path = `${dir}/${year}/${date}.md`;
        const text = mockRender(templates.get("daily") ?? "", {
          title: date,
          date,
          time: String(a.time),
        });
        notes.set(path, { text, mtime: Date.now() });
        ensureFolder(`${dir}/${year}`);
        insertNode(node(`${date}.md`, path, "note"));
        return { path, created: true };
      }
      case "daily_dates":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return mockDailyDates();
      case "tags_list": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const out: Array<{ tag: string; path: string; title: string }> = [];
        for (const [path, n] of notes) {
          const tags = new Set<string>();
          const fm = /^---\n([\s\S]*?)\n---/.exec(n.text)?.[1] ?? "";
          const listed = /^tags:\s*\[(.*)\]$/m.exec(fm)?.[1];
          for (const t of listed?.split(",") ?? []) if (t.trim()) tags.add(t.trim().toLowerCase());
          const body = n.text.slice(fm ? fm.length + 8 : 0).replace(/```[\s\S]*?```/g, "");
          for (const m of body.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu))
            if (m[1] && !/^\d+$/.test(m[1])) tags.add(m[1].replace(/\/+$/, "").toLowerCase());
          const title = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
          for (const tag of tags) out.push({ tag, path, title });
        }
        return out.sort((x, y) => x.tag.localeCompare(y.tag) || x.path.localeCompare(y.path));
      }
      case "tag_notes": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const tag = String(a.tag).replace(/^#/, "").toLowerCase();
        const seen = new Set<string>();
        for (const [path, n] of notes)
          if (new RegExp(`#${tag}(?:/|\\b)`, "i").test(n.text)) seen.add(path);
        return [...seen].sort();
      }
      case "backlinks": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const path = String(a.path);
        const out: Array<{
          source: string;
          sourceTitle: string;
          line: number;
          context: string;
          section: string | null;
          kind: string;
        }> = [];
        for (const [source, n] of notes) {
          if (source === path) continue;
          let section: string | null = null;
          n.text.split("\n").forEach((line, i) => {
            const h = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
            if (h) section = h[1] ?? null;
            for (const m of line.matchAll(/\[\[([^\]|#]+)/g)) {
              if (mockResolve(source, (m[1] ?? "").trim(), "wiki") === path)
                out.push({
                  source,
                  sourceTitle:
                    mockStem(source) === "04 methods"
                      ? "04 Methods"
                      : (source.split("/").pop() ?? source).replace(/\.md$/i, ""),
                  line: i + 1,
                  context: line.trim(),
                  section,
                  kind: "wiki",
                });
            }
          });
        }
        return out;
      }
      case "unlinked_mentions": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const path = String(a.path);
        const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
        const out: Array<{
          source: string;
          sourceTitle: string;
          line: number;
          context: string;
          matched: string;
          section: string | null;
        }> = [];
        for (const [source, n] of notes) {
          if (source === path) continue;
          let section: string | null = null;
          n.text.split("\n").forEach((line, i) => {
            const h = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
            if (h) section = h[1] ?? null;
            const bare = line.replace(/\[\[[^\]]*\]\]/g, (x) => " ".repeat(x.length));
            const at = bare.toLowerCase().indexOf(name.toLowerCase());
            if (at !== -1)
              out.push({
                source,
                sourceTitle: (source.split("/").pop() ?? source).replace(/\.md$/i, ""),
                line: i + 1,
                context: line.trim(),
                matched: line.slice(at, at + name.length),
                section,
              });
          });
        }
        return out;
      }
      case "link_mention_apply": {
        const n = notes.get(String(a.source));
        if (!n) return false;
        const lines = n.text.split("\n");
        const idx = Number(a.line) - 1;
        const matched = String(a.matched);
        const target = String(a.target);
        const at = lines[idx]?.indexOf(matched) ?? -1;
        if (at === -1) return false;
        const link = matched === target ? `[[${target}]]` : `[[${target}|${matched}]]`;
        lines[idx] = `${lines[idx]?.slice(0, at)}${link}${lines[idx]?.slice(at + matched.length)}`;
        notes.set(String(a.source), { text: lines.join("\n"), mtime: Date.now() });
        return true;
      }
      case "plugin:event|listen":
        return 1;
      case "plugin:event|unlisten":
        return null;
      default:
        throw new Error(`dev mock: unhandled command ${cmd}`);
    }
  });
}
