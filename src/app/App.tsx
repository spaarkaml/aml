import { useEffect, useState } from "react";
import { ShortcutsDialog } from "@/features/commands/ShortcutsDialog";
import { NoteEditor } from "@/features/editor/NoteEditor";
import { useEditorStore } from "@/features/editor/store";
import { useFolioStore } from "@/features/folio/store";
import { useFolioEvents } from "@/features/folio/useFolioEvents";
import { Welcome } from "@/features/folio/Welcome";
import { RenameLinksDialog } from "@/features/links/RenameLinksDialog";
import { Overview } from "@/features/overview/Overview";
import { useTabsSync } from "@/features/tabs/useTabsSync";
import { type AppInfo, commands } from "@/ipc";
import { registerShellCommands } from "./commands";
import { ContextPanel } from "./shell/ContextPanel";
import { LeftPanel } from "./shell/LeftPanel";
import { Shell } from "./shell/Shell";

registerShellCommands();

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const folio = useFolioStore((s) => s.folio);
  const notePath = useEditorStore((s) => s.path);
  useFolioEvents();
  useTabsSync();

  useEffect(() => {
    commands.appInfo().then(setInfo);
  }, []);

  return (
    <Shell info={info} left={<LeftPanel />} right={<ContextPanel />}>
      {folio ? notePath ? <NoteEditor /> : <Overview /> : <Welcome />}
      <RenameLinksDialog />
      <ShortcutsDialog />
    </Shell>
  );
}
