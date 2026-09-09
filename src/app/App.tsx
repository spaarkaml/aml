import { useEffect, useState } from "react";
import { FolioTree } from "@/features/folio/FolioTree";
import { useFolioStore } from "@/features/folio/store";
import { useFolioEvents } from "@/features/folio/useFolioEvents";
import { Welcome } from "@/features/folio/Welcome";
import { type AppInfo, commands } from "@/ipc";
import styles from "./App.module.css";
import { registerShellCommands } from "./commands";
import { Shell } from "./shell/Shell";

registerShellCommands();

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const folio = useFolioStore((s) => s.folio);
  useFolioEvents();

  useEffect(() => {
    commands.appInfo().then(setInfo);
  }, []);

  return (
    <Shell
      info={info}
      left={
        folio ? <FolioTree /> : <p className={styles.placeholder}>Open a Folio to browse it.</p>
      }
      right={
        <p className={styles.placeholder}>Outline, Backlinks and Properties arrive in Stage 2.</p>
      }
    >
      {folio ? (
        <div className={styles.welcome} data-testid="editor-placeholder">
          <p className={styles.tagline}>
            {folio.noteCount} notes in {folio.name}. The editor arrives in WP-1.2.
          </p>
        </div>
      ) : (
        <Welcome />
      )}
    </Shell>
  );
}
