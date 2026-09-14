import { Icon } from "../icons";
import styles from "./shell.module.css";

async function current() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/**
 * Minimise, maximise and close for Windows, where the window has no frame of its own and the
 * top bar is the title bar. Full height of the bar and 46px wide, as Windows 11 draws them;
 * close turns red under the pointer. What Windows 11 cannot give a frameless window is the Snap
 * Layouts flyout on hovering maximise — Win+Z still opens it.
 */
export function WindowControls({ maximized }: { maximized: boolean }) {
  return (
    <div className={styles.windowControls} data-testid="window-controls">
      <button
        type="button"
        className={styles.caption}
        onClick={() => void current().then((w) => w.minimize())}
        aria-label="Minimise"
        title="Minimise"
      >
        <Icon name="winMinimize" size={16} />
      </button>
      <button
        type="button"
        className={styles.caption}
        onClick={() => void current().then((w) => w.toggleMaximize())}
        aria-label={maximized ? "Restore" : "Maximise"}
        title={maximized ? "Restore" : "Maximise"}
      >
        <Icon name={maximized ? "winRestore" : "winMaximize"} size={16} />
      </button>
      <button
        type="button"
        className={styles.captionClose}
        onClick={() => void current().then((w) => w.close())}
        aria-label="Close"
        title="Close"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
