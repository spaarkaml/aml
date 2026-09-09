/** Platform helpers. `isMac` decides modifier-key labels and shortcut matching. */
export const isMac: boolean =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

export const modLabel = isMac ? "⌘" : "Ctrl";
