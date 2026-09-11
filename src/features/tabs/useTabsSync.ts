import { useEffect } from "react";
import { useAppearanceStore } from "@/features/appearance/store";
import { useBoundingsStore } from "@/features/boundings/store";
import { useDailyStore } from "@/features/daily/store";
import { useEditorStore } from "@/features/editor/store";
import { useBrowserStore } from "@/features/folio/browserStore";
import { useFolioStore } from "@/features/folio/store";
import { useProjectStore } from "@/features/project/store";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { useSettingsStore } from "@/features/settings/store";
import { useTagsStore } from "@/features/tags/store";
import { useTemplatesStore } from "@/features/templates/store";
import { useTypesStore } from "@/features/types/store";
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
    useProjectStore.getState().setRoot(root);
    if (root) {
      void useQuickOpenStore.getState().refresh();
      void useTagsStore.getState().refresh();
      void useTypesStore.getState().refresh();
      void useDailyStore.getState().refresh();
      void useTemplatesStore.getState().refresh();
      void useBoundingsStore.getState().refresh();
      void useAppearanceStore.getState().load();
      void useSettingsStore.getState().load();
    } else {
      useQuickOpenStore.getState().clear();
      useTagsStore.getState().clear();
      useTypesStore.getState().clear();
      useDailyStore.getState().clear();
      useTemplatesStore.getState().clear();
      useBoundingsStore.getState().clear();
      useProjectStore.getState().clear();
      useAppearanceStore.getState().clear();
      useSettingsStore.getState().clear();
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
