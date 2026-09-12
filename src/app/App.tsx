import { useEffect, useState } from "react";
import { ShortcutsDialog } from "@/features/commands/ShortcutsDialog";
import { NoteEditor } from "@/features/editor/NoteEditor";
import { useEditorStore } from "@/features/editor/store";
import { useFolioStore } from "@/features/folio/store";
import { useFolioEvents } from "@/features/folio/useFolioEvents";
import { Welcome } from "@/features/folio/Welcome";
import { RenameLinksDialog } from "@/features/links/RenameLinksDialog";
import { Overview } from "@/features/overview/Overview";
import { ProjectScreen } from "@/features/project/ProjectScreen";
import { useProjectStore } from "@/features/project/store";
import { useTabsSync } from "@/features/tabs/useTabsSync";
import { UpdateScreen } from "@/features/update/UpdateScreen";
import { type AppInfo, commands } from "@/ipc";
import { registerShellCommands } from "./commands";
import { ContextPanel } from "./shell/ContextPanel";
import { LeftPanel } from "./shell/LeftPanel";
import { Shell } from "./shell/Shell";

registerShellCommands();

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const folio = useFolioStore((s) => s.folio);
  const booted = useFolioStore((s) => s.booted);
  const bootstrap = useFolioStore((s) => s.bootstrap);
  const notePath = useEditorStore((s) => s.path);
  const projectScreen = useProjectStore((s) => (s.project ? s.screen : null));
  useFolioEvents();
  useTabsSync();

  useEffect(() => {
    commands.appInfo().then(setInfo);
  }, []);

  // Runs once, before anything decides what to render: bootstrap reopens the Folio you were
  // last in, and rendering Welcome first would flash a screen you are not meant to see again.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Shell info={info} left={<LeftPanel />} right={<ContextPanel />}>
      {!booted ? null : folio ? (
        projectScreen ? (
          <ProjectScreen />
        ) : notePath ? (
          <NoteEditor />
        ) : (
          <Overview />
        )
      ) : (
        <Welcome />
      )}
      <RenameLinksDialog />
      <ShortcutsDialog />
      <UpdateScreen info={info} />
    </Shell>
  );
}
