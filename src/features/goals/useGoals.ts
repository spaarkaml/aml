import { useEffect } from "react";
import { useEditorStore } from "@/features/editor/store";
import { useGoalsStore } from "./store";

/**
 * Follows the editor's word count so today's tally is what you wrote, not what you opened.
 * Mounted once in the shell. A subscription rather than a call inside the editor store: the
 * editor should not have to know that anything is counting.
 */
export function useGoals(): void {
  useEffect(() => {
    const { record } = useGoalsStore.getState();
    record(useEditorStore.getState().path, useEditorStore.getState().words);
    return useEditorStore.subscribe((state, previous) => {
      if (state.path === previous.path && state.words === previous.words) return;
      record(state.path, state.words);
    });
  }, []);
}
