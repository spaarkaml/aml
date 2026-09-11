import { describe, expect, it } from "vitest";
import type { SyncDevice, SyncFolder, SyncStatus } from "@/ipc";
import { describeSync, OFFLINE_AFTER_MS, syncedFolderFor } from "./store";

const NAS = "NAS-1";
const ROOT = "/Users/b/Writing";

function device(over: Partial<SyncDevice> = {}): SyncDevice {
  return { id: NAS, name: "DRIVESTOR", connected: true, address: "tcp://10.0.0.9:22000", ...over };
}

function folder(over: Partial<SyncFolder> = {}): SyncFolder {
  return {
    id: "writing",
    label: "Writing",
    path: ROOT,
    state: "idle",
    completion: 100,
    needBytes: 0,
    devices: [NAS],
    error: null,
    ...over,
  };
}

function status(over: Partial<SyncStatus> = {}): SyncStatus {
  return {
    enabled: true,
    running: true,
    starting: false,
    myId: "ME",
    version: "v2.1.5",
    devices: [device()],
    folders: [folder()],
    pending: [],
    guiUrl: "http://127.0.0.1:8384",
    error: null,
    ...over,
  };
}

/**
 * Connecting to a NAS is a sequence of waits — the sidecar booting, the device being found,
 * the folder catching up — and they used to collapse into one "NAS offline", which reads as a
 * failure while everything is working. Each of these is a distinct thing the user is told.
 */
describe("describeSync", () => {
  it("says nothing at all when sync is off", () => {
    expect(describeSync(status({ enabled: false }), ROOT)).toBeNull();
    expect(describeSync(null, ROOT)).toBeNull();
  });

  it("reports the sidecar coming up, even before a Folio is open", () => {
    expect(describeSync(status({ starting: true, running: false }), null)).toBe("Starting sync…");
  });

  it("keeps quiet about folders when no Folio is open", () => {
    expect(describeSync(status(), null)).toBeNull();
  });

  it("separates a sidecar that never started from one that is starting", () => {
    expect(describeSync(status({ running: false }), ROOT)).toBe("Sync stopped");
  });

  it("calls an unreachable NAS 'finding' before it calls it offline", () => {
    const s = status({ devices: [device({ connected: false })] });
    const t0 = 1_000_000;
    expect(describeSync(s, ROOT, t0, t0 + 5_000)).toBe("Finding the NAS…");
    expect(describeSync(s, ROOT, t0, t0 + OFFLINE_AFTER_MS + 1)).toBe("NAS offline");
  });

  it("distinguishes a Folio outside sync from one with no NAS paired", () => {
    expect(describeSync(status(), "/somewhere/else")).toBe("Not synced");
    expect(describeSync(status({ folders: [folder({ devices: [] })], devices: [] }), ROOT)).toBe(
      "No NAS paired",
    );
  });

  it("shows progress while catching up, and an error above everything else", () => {
    expect(
      describeSync(status({ folders: [folder({ state: "syncing", completion: 42.7 })] }), ROOT),
    ).toBe("Syncing 42%");
    expect(describeSync(status({ folders: [folder({ state: "scanning" })] }), ROOT)).toBe(
      "Scanning…",
    );
    expect(describeSync(status({ folders: [folder({ error: "denied" })] }), ROOT)).toBe(
      "Sync error",
    );
    expect(describeSync(status(), ROOT)).toBe("NAS · up to date");
  });

  it("matches a note's Folio to the folder that contains it", () => {
    expect(syncedFolderFor(status(), `${ROOT}/journal`)?.id).toBe("writing");
    expect(syncedFolderFor(status(), "/Users/b/Other")).toBeNull();
  });
});
