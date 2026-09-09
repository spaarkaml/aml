import { useAppearanceStore } from "@/features/appearance/store";
import { usePaletteStore } from "@/features/commands/paletteStore";
import { formatShortcut } from "@/features/commands/registry";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { SHORTCUTS } from "../commands";
import styles from "./shell.module.css";

const MODE_LABEL = { system: "Auto", paper: "Paper", ink: "Ink" } as const;

export function TopBar() {
  const layout = useLayoutStore((s) => s.layout);
  const toggleLayout = useLayoutStore((s) => s.toggleLayout);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const left = useLayoutStore((s) => s.left);
  const right = useLayoutStore((s) => s.right);
  const setting = useAppearanceStore((s) => s.setting);
  const cycleMode = useAppearanceStore((s) => s.cycle);
  const openPalette = usePaletteStore((s) => s.setOpen);
  const folio = useFolioStore((s) => s.folio);

  return (
    <header className={styles.topbar}>
      <span className={styles.wordmark}>AML</span>
      <button
        type="button"
        className={styles.iconButton}
        aria-pressed={left.open}
        onClick={() => togglePanel("left")}
        title={`Browser (${formatShortcut(SHORTCUTS.leftPanel)})`}
      >
        ◧
      </button>
      <nav className={styles.crumbs} aria-label="Breadcrumb" data-testid="breadcrumb">
        <span>{folio ? folio.name : "Overview"}</span>
      </nav>
      <div className={styles.tabs} role="tablist" aria-label="Open notes" />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={cycleMode}
          title={`Appearance (${formatShortcut(SHORTCUTS.mode)})`}
        >
          {MODE_LABEL[setting]}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleLayout}
          title={`Layout (${formatShortcut(SHORTCUTS.layout)})`}
          data-testid="layout-toggle"
        >
          {layout === "desk" ? "Desk" : "Page"}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => openPalette(true)}
          title={`Commands (${formatShortcut(SHORTCUTS.palette)})`}
        >
          {formatShortcut(SHORTCUTS.palette)}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-pressed={right.open}
          onClick={() => togglePanel("right")}
          title={`Context (${formatShortcut(SHORTCUTS.rightPanel)})`}
        >
          ◨
        </button>
      </div>
    </header>
  );
}
