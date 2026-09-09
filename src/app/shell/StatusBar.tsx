import type { AppInfo } from "@/ipc";
import styles from "./shell.module.css";

export function StatusBar({ info }: { info: AppInfo | null }) {
  return (
    <footer className={styles.statusbar}>
      <span>0 words</span>
      <span>en-AU</span>
      <span className={styles.spacer} />
      {info ? (
        <span data-testid="app-info">
          v{info.version} · {info.platform}/{info.arch}
          {info.debug ? " · debug" : ""}
        </span>
      ) : null}
    </footer>
  );
}
