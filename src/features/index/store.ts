import { create } from "zustand";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { commands, events, type IndexStatus } from "@/ipc";

/** How often the status is re-read while a build is running (events cover the real app;
 *  polling keeps the mock and any missed event honest). */
export const BUILD_POLL_MS = 400;

interface IndexState {
  status: IndexStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
  rebuild: () => Promise<void>;
  clear: () => void;
}

let poll: ReturnType<typeof setInterval> | null = null;
/** Bumped by every status request and by `rebuild`, so a late answer cannot overwrite a
 *  newer state (a stale "not building" would stop the polling a rebuild just started). */
let generation = 0;

function stopPolling(): void {
  if (poll) clearInterval(poll);
  poll = null;
}

function pollWhileBuilding(): void {
  if (poll) return;
  poll = setInterval(() => {
    void useIndexStore.getState().refresh();
  }, BUILD_POLL_MS);
}

export const useIndexStore = create<IndexState>((set, get) => ({
  status: null,
  error: null,
  refresh: async () => {
    const gen = ++generation;
    const r = await commands.indexStatus();
    if (gen !== generation) return;
    if (r.status !== "ok") {
      stopPolling();
      set({ status: null });
      return;
    }
    const was = get().status?.building ?? false;
    set({ status: r.data });
    if (r.data.building) pollWhileBuilding();
    else {
      stopPolling();
      if (was) void useQuickOpenStore.getState().refresh();
    }
  },
  rebuild: async () => {
    set({ error: null });
    const r = await commands.indexRebuild();
    generation += 1;
    if (r.status !== "ok") {
      set({
        error: r.error.kind === "noFolioOpen" ? "Open a Folio first." : String(r.error.detail),
      });
      return;
    }
    // Show progress from the moment the build starts, even if no status has been read yet:
    // waiting for the first poll left the status bar blank for builds shorter than a tick.
    set((s) => ({
      status: {
        notes: 0,
        lastBuilt: 0,
        lastDurationMs: 0,
        ...s.status,
        building: true,
        done: 0,
        total: 0,
      },
    }));
    pollWhileBuilding();
  },
  clear: () => {
    stopPolling();
    set({ status: null, error: null });
  },
}));

/** Subscribes to Rust's build progress for as long as a Folio is open. */
export function listenIndexProgress(): () => void {
  let off: (() => void) | null = null;
  let disposed = false;
  void events.indexProgress
    .listen((e) => {
      const { done, total } = e.payload;
      const building = done < total || total === 0;
      useIndexStore.setState((s) => ({
        status: s.status
          ? { ...s.status, building, done, total }
          : { notes: 0, building, done, total, lastBuilt: 0, lastDurationMs: 0 },
      }));
      if (!building) void useIndexStore.getState().refresh();
    })
    .then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
  void useIndexStore.getState().refresh();
  return () => {
    disposed = true;
    off?.();
    useIndexStore.getState().clear();
  };
}

/** Status-bar label while a build runs; null when idle. */
export function describeIndex(status: IndexStatus | null): string | null {
  if (!status?.building) return null;
  if (status.total === 0) return "Indexing…";
  return `Indexing ${status.done.toLocaleString("en-AU")} / ${status.total.toLocaleString("en-AU")}`;
}
