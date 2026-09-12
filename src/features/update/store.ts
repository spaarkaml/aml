import { create } from "zustand";
import { persist } from "zustand/middleware";
import { commands, events, type UpdateInfo } from "@/ipc";
import { CHECK_EVERY_MS, describeUpdateError, shouldOffer } from "./update";

/** Where the update is up to. One line of state, because only one update runs at a time. */
export type Stage = "idle" | "checking" | "available" | "downloading" | "upToDate" | "error";

interface UpdateState {
  stage: Stage;
  info: UpdateInfo | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  /** Unix ms of the last completed check, kept so a relaunch does not re-check immediately. */
  lastChecked: number;
  /** Look for updates by itself. Per device — this machine's network, this machine's choice. */
  auto: boolean;
  /** A version the user said "Not now" to; a later one un-skips itself. */
  skipped: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  setAuto: (auto: boolean) => void;
  /** A silent check says nothing when it fails: an aeroplane is not an error message. */
  check: (silent?: boolean) => Promise<void>;
  install: () => Promise<void>;
  skip: () => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      stage: "idle",
      info: null,
      downloaded: 0,
      total: null,
      error: null,
      lastChecked: 0,
      auto: true,
      skipped: null,
      open: false,

      setOpen: (open) => set({ open, error: open ? get().error : null }),
      setAuto: (auto) => set({ auto }),

      check: async (silent = false) => {
        if (get().stage === "checking" || get().stage === "downloading") return;
        set({ stage: "checking", error: null });
        const r = await commands.updateCheck();
        if (r.status === "error") {
          set({
            stage: silent ? "idle" : "error",
            lastChecked: Date.now(),
            error: silent ? null : describeUpdateError(r.error),
          });
          return;
        }
        const info = r.data;
        set({
          info,
          lastChecked: Date.now(),
          stage: info ? "available" : "upToDate",
          // A check the user asked for answers out loud, even when the answer is "nothing".
          // A background one never interrupts: it lights the chip in the status bar instead.
          open: get().open || !silent,
        });
      },

      install: async () => {
        if (!get().info) return;
        set({ stage: "downloading", downloaded: 0, total: null, error: null, open: true });
        const r = await commands.updateInstall();
        // A good run never returns: the app restarts into the new version.
        if (r.status === "error") {
          set({ stage: "error", error: describeUpdateError(r.error) });
        }
      },

      skip: () => set({ skipped: get().info?.version ?? null, open: false, stage: "idle" }),
    }),
    {
      name: "aml.update",
      version: 1,
      partialize: (s) => ({ auto: s.auto, skipped: s.skipped, lastChecked: s.lastChecked }),
    },
  ),
);

/** True when this release is newer than anything the user has dismissed. */
export function updateOnOffer(s: UpdateState): boolean {
  return s.stage === "available" && shouldOffer(s.info, s.skipped);
}

/**
 * Starts the background checks: one shortly after launch (only if the last one has gone
 * stale), then one every six hours for as long as AML is running.
 *
 * The delay at launch is not politeness — the first seconds belong to opening the Folio and
 * the index, and an update is never urgent enough to compete with them.
 */
export const LAUNCH_DELAY_MS = 5000;

export function startUpdateChecks(): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    const s = useUpdateStore.getState();
    if (!s.auto) return;
    if (Date.now() - s.lastChecked < CHECK_EVERY_MS) return;
    void s.check(true);
  };
  const first = setTimeout(() => {
    tick();
    interval = setInterval(tick, CHECK_EVERY_MS);
  }, LAUNCH_DELAY_MS);
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}

/** Subscribes to download progress for as long as the update screen can show it. */
export function listenUpdateProgress(): () => void {
  let off: (() => void) | null = null;
  let disposed = false;
  void events.updateProgress
    .listen((e) => {
      const { downloaded, total, done } = e.payload;
      useUpdateStore.setState((s) =>
        done
          ? { total: s.total, downloaded: s.total ?? s.downloaded }
          : { downloaded, total: total ?? s.total },
      );
    })
    .then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
  return () => {
    disposed = true;
    off?.();
  };
}
