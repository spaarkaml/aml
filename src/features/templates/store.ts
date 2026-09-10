import { create } from "zustand";
import { commandRegistry } from "@/features/commands/registry";
import { nowTime, todayIso } from "@/features/daily/dates";
import { useBrowserStore } from "@/features/folio/browserStore";
import { activeDir, freeName, useFolioStore } from "@/features/folio/store";
import { useTabsStore } from "@/features/tabs/store";
import { commands, type TemplateInfo } from "@/ipc";
import { joinPath } from "@/lib/paths";

interface TemplatesState {
  list: TemplateInfo[];
  refresh: () => Promise<void>;
  clear: () => void;
  /** Creates a note from `template` in the active folder, opens it and starts a rename. */
  create: (template: string, dir?: string) => Promise<string | null>;
}

/** Undoes the palette commands registered for the last template list. */
let unregister: (() => void) | null = null;

/**
 * Templates are palette commands: "New Scene Note" for `_templates/Scene.md`. They are
 * registered from the Folio's own files, so they change when the Folio does — which is why
 * the registry hands back an unregister function rather than taking a static list.
 */
function syncCommands(list: TemplateInfo[]): void {
  unregister?.();
  unregister = null;
  if (list.length === 0) return;
  unregister = commandRegistry.register(
    ...list.map((t) => ({
      id: `template.new.${t.name.toLowerCase()}`,
      title: `New ${t.name} Note`,
      group: "Note",
      run: () => void useTemplatesStore.getState().create(t.name),
    })),
  );
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  list: [],

  refresh: async () => {
    const r = await commands.templatesList();
    if (r.status !== "ok") return;
    set({ list: r.data });
    syncCommands(r.data);
  },

  clear: () => {
    syncCommands([]);
    set({ list: [] });
  },

  create: async (template, dir) => {
    const folio = useFolioStore.getState();
    const target = dir ?? activeDir();
    const name = freeName(folio.tree, target, template, ".md");
    const path = joinPath(target, name);
    const r = await commands.noteFromTemplate(path, template, {
      title: name.replace(/\.md$/i, ""),
      date: todayIso(),
      time: nowTime(),
    });
    if (r.status !== "ok") return null;
    await folio.refreshTree();
    void get().refresh();
    useBrowserStore.getState().reveal(path);
    useTabsStore.getState().open(path);
    useBrowserStore.getState().startRename(path);
    return path;
  },
}));
