import { useEffect } from "react";
import { useBrowserStore } from "@/features/folio/browserStore";
import { freeName, useFolioStore } from "@/features/folio/store";
import { joinPath, parentDir } from "@/lib/paths";
import { fileNameFor, headingTitle, isAutoNamed } from "./autoTitle";
import { useEditorStore } from "./store";

/**
 * How long the title has to stand still before the file is renamed. The note is already saved
 * by then (the editor's own debounce is shorter), so this is only about not renaming the file
 * to every prefix of a heading as it is being typed.
 */
export const AUTO_TITLE_SETTLE_MS = 2000;

/**
 * Names an `Untitled` note after the level-one heading at the top of it, once the heading has
 * been sitting still for a moment. A note that has been given a name is left alone for ever
 * after: the file name is the user's once they have typed one (see `autoTitle.ts`).
 */
export function useAutoTitle(): void {
  const path = useEditorStore((s) => s.path);
  const doc = useEditorStore((s) => s.doc);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const conflict = useEditorStore((s) => s.conflict);
  const renaming = useBrowserStore((s) => s.renaming);

  useEffect(() => {
    // Wait for the note to be on disk and for nothing else to be moving it: a rename while
    // the user is typing their own name for it in the Browser would fight them.
    if (!path || !doc || dirty || saving || conflict) return;
    if (!isAutoNamed(path) || renaming === path) return;
    const title = headingTitle(doc);
    const name = title ? fileNameFor(title) : null;
    if (!name) return;
    const dir = parentDir(path);
    const timer = setTimeout(() => {
      const folio = useFolioStore.getState();
      if (folio.busy) return;
      const target = joinPath(dir, freeName(folio.tree, dir, name, ".md"));
      if (target === path) return;
      void folio.rename(path, target, "update");
    }, AUTO_TITLE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [path, doc, dirty, saving, conflict, renaming]);
}
