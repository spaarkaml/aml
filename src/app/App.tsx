import { useEffect, useState } from "react";
import { NoteEditor } from "@/features/editor/NoteEditor";
import { useEditorStore } from "@/features/editor/store";
import { FolioTree } from "@/features/folio/FolioTree";
import { useFolioStore } from "@/features/folio/store";
import { useFolioEvents } from "@/features/folio/useFolioEvents";
import { Welcome } from "@/features/folio/Welcome";
import { PropertiesPanel } from "@/features/properties/PropertiesPanel";
import { type AppInfo, commands } from "@/ipc";
import styles from "./App.module.css";
import { registerShellCommands } from "./commands";
import { Shell } from "./shell/Shell";

registerShellCommands();

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const folio = useFolioStore((s) => s.folio);
  const notePath = useEditorStore((s) => s.path);
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
      right={<PropertiesPanel />}
    >
      {folio ? (
        notePath ? (
          <NoteEditor />
        ) : (
          <div className={styles.welcome} data-testid="editor-placeholder">
            <p className={styles.tagline}>
              {folio.noteCount} notes in {folio.name}. Pick one from the Browser.
            </p>
          </div>
        )
      ) : (
        <Welcome />
      )}
    </Shell>
  );
}
