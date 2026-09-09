import { useEffect } from "react";
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
    events.folioChanged
      .listen(() => {
        void refreshTree();
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
