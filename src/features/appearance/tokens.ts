import type { Mode } from "./store";

/**
 * The colour tokens the Appearance screen edits (ADR-010; Paper's values are ADR-013). The
 * defaults here must match `src/app/tokens.css` — a unit test compares the two files, because
 * a drift between them makes "Reset to AML" restore a colour the app never had. An edited
 * token is written as a custom property on `:root`, and clearing it lets the stylesheet win.
 */
export interface TokenSpec {
  /** The part after `--aml-`; also how it is written in `.aml/config.yaml`. */
  name: string;
  label: string;
  role: string;
  /** Text tokens are checked for contrast against the background as you edit. */
  text: boolean;
}

export const TOKENS: TokenSpec[] = [
  {
    name: "bg",
    label: "Background",
    role: "Window chrome: toolbar, sidebars, status bar",
    text: false,
  },
  { name: "surface", label: "Surface", role: "The page, cards, popovers", text: false },
  { name: "text", label: "Text", role: "Body text", text: true },
  { name: "primary", label: "Primary", role: "Headings, links, active states", text: true },
  { name: "muted", label: "Muted", role: "Hairlines and rules (decorative)", text: false },
  { name: "highlight", label: "Highlight", role: "Hover and row selection fill", text: false },
  { name: "accent", label: "Accent", role: "Progress, warnings, the unsaved dot", text: false },
];

export const DEFAULTS: Record<Mode, Record<string, string>> = {
  paper: {
    bg: "#f5f5f7",
    surface: "#ffffff",
    text: "#1d1d1f",
    primary: "#006078",
    muted: "#d8d8dd",
    highlight: "#e8e8ed",
    accent: "#e37c78",
  },
  ink: {
    bg: "#17262b",
    surface: "#1f3238",
    text: "#f0e9e7",
    primary: "#82bac4",
    muted: "#2f4a52",
    highlight: "#3a2e31",
    accent: "#e37c78",
  },
};

/** Type defaults, matching `NoteEditor.module.css`. */
export const TYPE_DEFAULTS = { measure: 70, leading: 1.65, paragraphSpacing: 1 };

/** ADR-013's interface face. Kept in one place so `tokens.css` and the picker cannot drift. */
const UI_SYSTEM_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

export interface FontSpec {
  name: string;
  stack: string;
  /** Bundled faces ship with AML; the rest are asked of the operating system. */
  bundled: boolean;
  note: string;
}

/** The faces approved in ADR-010, plus the system families they fall back to. */
export const EDITOR_FONTS: FontSpec[] = [
  {
    name: "Source Serif 4",
    stack: '"Source Serif 4", "Times New Roman", serif',
    bundled: true,
    note: "AML's own; also the default Book Design face",
  },
  {
    name: "Literata",
    stack: "Literata, Georgia, serif",
    bundled: true,
    note: "Made for reading on screen",
  },
  {
    name: "EB Garamond",
    stack: '"EB Garamond", Garamond, serif',
    bundled: true,
    note: "Classic fiction",
  },
  {
    name: "Times New Roman",
    stack: '"Times New Roman", Times, serif',
    bundled: false,
    note: "From your system",
  },
  { name: "Georgia", stack: "Georgia, serif", bundled: false, note: "From your system" },
  {
    name: "IBM Plex Mono",
    stack: '"IBM Plex Mono", Menlo, Consolas, monospace',
    bundled: true,
    note: "Monospaced",
  },
];

export const UI_FONTS: FontSpec[] = [
  {
    name: "System",
    stack: UI_SYSTEM_STACK,
    bundled: false,
    note: "AML's default — SF Pro on macOS, Segoe UI on Windows",
  },
  {
    name: "Arial",
    stack: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    bundled: false,
    note: "From your system",
  },
  {
    name: "Helvetica",
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    bundled: false,
    note: "From your system",
  },
  {
    name: "Verdana",
    stack: "Verdana, Geneva, sans-serif",
    bundled: false,
    note: "Wider, easier at small sizes",
  },
];

export function fontStack(fonts: FontSpec[], name: string | null | undefined): string | null {
  if (!name) return null;
  return fonts.find((f) => f.name === name)?.stack ?? `"${name}", serif`;
}

/* ---------------- contrast ---------------- */

function channel(hex: string, at: number): number {
  const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio, 1–21. Returns 0 for anything that is not `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  if (!isHex(a) || !isHex(b)) return 0;
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** How a ratio reads in the Appearance screen: body text needs 4.5, large text 3. */
export function contrastVerdict(ratio: number): { label: string; ok: boolean } {
  if (ratio >= 7) return { label: `${ratio.toFixed(1)}:1 AAA`, ok: true };
  if (ratio >= 4.5) return { label: `${ratio.toFixed(1)}:1 AA`, ok: true };
  if (ratio >= 3) return { label: `${ratio.toFixed(1)}:1 large text only`, ok: false };
  return { label: `${ratio.toFixed(1)}:1 too low`, ok: false };
}
