import { current, type ModeSetting, useAppearanceStore } from "@/features/appearance/store";
import { usePaletteStore } from "@/features/commands/paletteStore";
import { commandRegistry, formatShortcut } from "@/features/commands/registry";
import { useLayoutStore } from "@/features/layout/store";
import { useProjectStore } from "@/features/project/store";
import { useSettingsStore } from "@/features/settings/store";
import { Breadcrumb } from "@/features/tabs/Breadcrumb";
import { TabStrip } from "@/features/tabs/TabStrip";
import { SHORTCUTS } from "../commands";
import { Icon } from "../icons";
import { Monogram } from "../Monogram";
import styles from "./shell.module.css";

const MODE_LABEL = { system: "Auto", paper: "Paper", ink: "Ink" } as const;

export function TopBar() {
  const layout = useLayoutStore((s) => s.layout);
  const toggleLayout = useLayoutStore((s) => s.toggleLayout);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const left = useLayoutStore((s) => s.left);
  const right = useLayoutStore((s) => s.right);
  const setting = useAppearanceStore((s) => (current(s).mode ?? "system") as ModeSetting);
  const cycleMode = useAppearanceStore((s) => s.cycle);
  const openPalette = usePaletteStore((s) => s.setOpen);
  const openSettings = useSettingsStore((s) => s.setOpen);
  const project = useProjectStore((s) => s.project);
  const showProject = useProjectStore((s) => s.show);

  return (
    <header className={styles.topbar}>
      <span className={styles.wordmark} data-testid="wordmark">
        <Monogram height={17} />
      </span>
      <button
        type="button"
        className={styles.iconButton}
        aria-pressed={left.open}
        onClick={() => togglePanel("left")}
        title={`Browser (${formatShortcut(commandRegistry.shortcutOf("panel.left.toggle") ?? SHORTCUTS.leftPanel)})`}
        aria-label="Browser"
      >
        <Icon name="panelLeft" />
      </button>
      <nav className={styles.crumbs} aria-label="Breadcrumb" data-testid="breadcrumb">
        <Breadcrumb />
      </nav>
      {project ? (
        <button
          type="button"
          className={styles.projectTab}
          onClick={() => showProject("dashboard")}
          title={`${project.title} — Project dashboard`}
          data-testid="project-tab"
        >
          <Icon name="book" size={13} />
          <span className={styles.projectName}>{project.title}</span>
        </button>
      ) : null}
      <TabStrip />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={cycleMode}
          title={`Appearance (${formatShortcut(commandRegistry.shortcutOf("appearance.cycle") ?? SHORTCUTS.mode)})`}
        >
          {MODE_LABEL[setting]}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleLayout}
          title={`Layout (${formatShortcut(commandRegistry.shortcutOf("layout.toggle") ?? SHORTCUTS.layout)})`}
          data-testid="layout-toggle"
        >
          {layout === "desk" ? "Desk" : "Page"}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => openSettings(true)}
          title={`Settings (${formatShortcut(commandRegistry.shortcutOf("settings.open") ?? SHORTCUTS.settings)})`}
          aria-label="Settings"
          data-testid="settings-open"
        >
          <Icon name="settings" />
        </button>
        <button
          type="button"
          className={styles.kbdButton}
          onClick={() => openPalette(true)}
          title={`Commands (${formatShortcut(commandRegistry.shortcutOf("palette.open") ?? SHORTCUTS.palette)})`}
        >
          {formatShortcut(commandRegistry.shortcutOf("palette.open") ?? SHORTCUTS.palette)}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-pressed={right.open}
          onClick={() => togglePanel("right")}
          title={`Context (${formatShortcut(commandRegistry.shortcutOf("panel.right.toggle") ?? SHORTCUTS.rightPanel)})`}
          aria-label="Context"
        >
          <Icon name="panelRight" />
        </button>
      </div>
    </header>
  );
}
