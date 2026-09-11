/**
 * The interface icon set (ADR-013).
 *
 * One 16px grid, 1.3px strokes, round caps, `currentColor` — so an icon takes the colour and
 * the disabled state of whatever control it sits in, and nothing has to be redrawn for Ink.
 * This replaces the literal characters the shell used to type (◧ ◨ ↺ ✎ ▸ ▾ ‹ › ×), which
 * rendered at whatever weight and baseline the OS font happened to give them.
 *
 * Keyboard glyphs (⌘ ⌥ ⇧ ⌃) are NOT here: those are real Apple typography and belong as text.
 *
 * The SVG is always `aria-hidden`. An icon-only control carries its own `aria-label`.
 */

export type IconName =
  | "panelLeft"
  | "panelRight"
  | "close"
  | "revert"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "pencil"
  | "plus"
  | "search"
  | "folder"
  | "file"
  | "check"
  | "trash"
  | "home"
  | "settings";

/** Path data on a 16×16 grid. Stroked, never filled — see `Icon` below. */
const PATHS: Record<IconName, string> = {
  panelLeft:
    "M2.4 3.9a1.5 1.5 0 0 1 1.5-1.5h8.2a1.5 1.5 0 0 1 1.5 1.5v8.2a1.5 1.5 0 0 1-1.5 1.5H3.9a1.5 1.5 0 0 1-1.5-1.5zM6.6 2.4v11.2",
  panelRight:
    "M2.4 3.9a1.5 1.5 0 0 1 1.5-1.5h8.2a1.5 1.5 0 0 1 1.5 1.5v8.2a1.5 1.5 0 0 1-1.5 1.5H3.9a1.5 1.5 0 0 1-1.5-1.5zM9.4 2.4v11.2",
  close: "m4.4 4.4 7.2 7.2M11.6 4.4l-7.2 7.2",
  revert: "M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3 2.9v2.8h2.8",
  chevronLeft: "m9.8 3.6-4 4.4 4 4.4",
  chevronRight: "m6.2 3.6 4 4.4-4 4.4",
  chevronDown: "m3.6 6.2 4.4 4 4.4-4",
  pencil: "M11.1 2.6a1.6 1.6 0 0 1 2.3 2.3L5.6 12.7l-3 .7.7-3zM10 3.7l2.3 2.3",
  plus: "M8 3.4v9.2M3.4 8h9.2",
  search: "M11.2 7.2a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM10.1 10.1 13.6 13.6",
  folder:
    "M2.2 4.5a1.5 1.5 0 0 1 1.5-1.5h2.2l1.4 1.6h5a1.5 1.5 0 0 1 1.5 1.5v5.4a1.5 1.5 0 0 1-1.5 1.5H3.7a1.5 1.5 0 0 1-1.5-1.5z",
  file: "M3.6 3.1a1 1 0 0 1 1-1h3.9l3.5 3.6v7.2a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1zM8.4 2.2v3.6h3.6",
  check: "m3.4 8.4 3 3 6.2-6.6",
  home: "M2.4 7.1 8 2.4l5.6 4.7M4.1 6.2v6.3a1 1 0 0 0 1 1h5.8a1 1 0 0 0 1-1V6.2",
  // Sliders rather than a cog: at 16px a cog's teeth turn to mush, and macOS itself
  // uses sliders for "the settings of this thing".
  settings:
    "M2.4 4.4h2.2M7.8 4.4h5.8M7.8 4.4a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 1 0 3.2 0M2.4 8h6.6M12.2 8h1.4M12.2 8a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 1 0 3.2 0M2.4 11.6h2.2M7.8 11.6h5.8M7.8 11.6a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 1 0 3.2 0",
  trash:
    "M2.8 4.4h10.4M6.2 4.4V3.1a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.3M4.2 4.4l.6 8.4a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.4",
};

interface Props {
  name: IconName;
  /** Box size in px. The stroke is scaled with it so a 20px icon still reads as one line. */
  size?: number;
  className?: string | undefined;
}

export function Icon({ name, size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={(1.3 * 16) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
