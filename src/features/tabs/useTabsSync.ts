import { useEffect } from "react";
import { useEditorStore } from "@/features/editor/store";
import { useBrowserStore } from "@/features/folio/browserStore";
import { useFolioStore } from "@/features/folio/store";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { useTagsStore } from "@/features/tags/store";
import { useTabsStore } from "./store";

/**
 * Glue between the Folio, the tab list and the single editor instance:
 * - the tabs store follows the open Folio (per-Folio tab lists, restored on reopen);
 * - the editor follows the active tab, closing a tab whose note no longer exists.
 * Mount once in App.
 */
export function useTabsSync(): void {
  const root = useFolioStore((s) => s.folio?.root ?? null);
  const active = useTabsStore((s) =>
    s.folioRoot ? (s.byFolio[s.folioRoot]?.active ?? null) : null,
  );

  useEffect(() => {
    useTabsStore.getState().setFolio(root);
    useBrowserStore.getState().setRoot(root);
    if (root) {
      void useQuickOpenStore.getState().refresh();
      void useTagsStore.getState().refresh();
    } else {
      useQuickOpenStore.getState().clear();
      useTagsStore.getState().clear();
    }
  }, [root]);

  useEffect(() => {
    const editor = useEditorStore.getState();
    if (active === editor.path) return;
    if (!active) {
      void editor.close();
      return;
    }
    void editor.open(active).then((ok) => {
      if (!ok && useTabsStore.getState().current().active === active) {
        useTabsStore.getState().close(active);
      }
    });
  }, [active]);
}
