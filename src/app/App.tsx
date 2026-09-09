import { useEffect, useState } from "react";
import { type AppInfo, commands } from "@/ipc";
import styles from "./App.module.css";

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    commands.appInfo().then(setInfo);
  }, []);

  return (
    <main className={styles.shell}>
      <h1 className={styles.wordmark}>AML</h1>
      <p className={styles.tagline}>Hello Folio.</p>
      {info ? (
        <p className={styles.meta} data-testid="app-info">
          v{info.version} · {info.platform}/{info.arch}
          {info.debug ? " · debug" : ""}
        </p>
      ) : null}
    </main>
  );
}
