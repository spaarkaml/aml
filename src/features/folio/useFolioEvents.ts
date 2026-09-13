import { useEffect } from "react";
import { useBoundingsStore } from "@/features/boundings/store";
import { useConflictsStore } from "@/features/conflicts/store";
import { useDailyStore } from "@/features/daily/store";
import { useEditorStore } from "@/features/editor/store";
import { useLinkStore } from "@/features/links/store";
import { useProjectStore } from "@/features/project/store";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { useTagsStore } from "@/features/tags/store";
import { useTypesStore } from "@/features/types/store";
import { events } from "@/ipc";
import { useFolioStore } from "./store";

/** Refreshes the tree whenever the Rust watcher reports changes on disk. */
export function useFolioEvents(): void {
  const folio = useFolioStore((s) => s.folio);
  const refreshTree = useFolioStore((s) => s.refreshTree);
  useEffect(() => {
    if (!folio) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void useConflictsStore.getState().refresh();
    events.folioChanged
      .listen((e) => {
        void refreshTree();
        void useQuickOpenStore.getState().refresh();
        useLinkStore.getState().invalidate();
        void useTagsStore.getState().refresh();
        void useDailyStore.getState().refresh();
        void useBoundingsStore.getState().refresh();
        void useTypesStore.getState().refresh();
        void useProjectStore.getState().refresh();
        // Listing conflicts walks the Folio, so only when a copy arrived or went: every autosave
        // is a change event, and walking ten thousand files per keystroke pause is not free.
        if (e.payload.paths.some((p) => p.includes(".sync-conflict-"))) {
          void useConflictsStore.getState().refresh();
        }
        for (const p of e.payload.paths) useEditorStore.getState().noteChangedOnDisk(p);
      })
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [folio, refreshTree]);
}
