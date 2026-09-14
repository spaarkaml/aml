import { useEffect, useState } from "react";

/**
 * How the window's own title bar is merged into AML's top bar, so a window has one top, not two.
 *
 * - `mac`: the native title bar is an overlay (`tauri.macos.conf.json`); the red, yellow and
 *   green buttons float over the top bar's left end, and the top bar leaves room for them —
 *   except in full screen, where macOS hides them.
 * - `windows`: the window has no frame (`tauri.windows.conf.json`); minimise, maximise and close
 *   are drawn by `WindowControls` at the top bar's right end.
 * - `none`: not running inside Tauri (the browser build and the tests) — nothing to merge.
 */
export type TitleBarKind = "mac" | "windows" | "none";

export function titleBarKind(platform: string, inTauri: boolean): TitleBarKind {
  if (!inTauri) return "none";
  if (/Mac/i.test(platform)) return "mac";
  if (/Win/i.test(platform)) return "windows";
  return "none";
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const TITLE_BAR: TitleBarKind = titleBarKind(
  typeof navigator !== "undefined" ? (navigator.platform ?? "") : "",
  inTauri,
);

/**
 * Whether the window is maximised (Windows: which glyph the middle button shows) or in full
 * screen (macOS: whether the traffic lights are there to leave room for). Both change only when
 * the window is resized, so that is when they are asked.
 */
export function useWindowState(kind: TitleBarKind): { maximized: boolean; fullscreen: boolean } {
  const [state, setState] = useState({ maximized: false, fullscreen: false });
  useEffect(() => {
    if (kind === "none") return;
    let unlisten: (() => void) | undefined;
    let stale = false;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const read = async () => {
        const [maximized, fullscreen] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
        if (!stale) setState({ maximized, fullscreen });
      };
      await read();
      const off = await win.onResized(() => void read());
      if (stale) off();
      else unlisten = off;
    });
    return () => {
      stale = true;
      unlisten?.();
    };
  }, [kind]);
  return state;
}
