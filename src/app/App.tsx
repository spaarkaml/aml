import { useEffect, useState } from "react";
import { type AppInfo, commands } from "@/ipc";
import styles from "./App.module.css";
import { registerShellCommands } from "./commands";
import { Shell } from "./shell/Shell";

registerShellCommands();

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    commands.appInfo().then(setInfo);
  }, []);

  return (
    <Shell
      info={info}
      left={<p className={styles.placeholder}>Folio Browser arrives in WP-1.5.</p>}
      right={
        <p className={styles.placeholder}>Outline, Backlinks and Properties arrive in Stage 2.</p>
      }
    >
      <div className={styles.welcome}>
        <h1 className={styles.wordmark}>AML</h1>
        <p className={styles.tagline}>Hello Folio.</p>
      </div>
    </Shell>
  );
}
