import { describe, expect, it } from "vitest";
import type { SyncDevice, SyncFolder, SyncStatus } from "@/ipc";
import {
  describeSync,
  OFFLINE_AFTER_MS,
  STALLED_AFTER_MS,
  seenAgo,
  syncedFolderFor,
  syncTrouble,
  trackProgress,
} from "./store";

const NAS = "NAS-1";
const ROOT = "/Users/b/Writing";

function device(over: Partial<SyncDevice> = {}): SyncDevice {
  return {
    id: NAS,
    name: "DRIVESTOR",
    connected: true,
    address: "tcp://10.0.0.9:22000",
    lastSeen: null,
    paused: false,
    ...over,
  };
}

function folder(over: Partial<SyncFolder> = {}): SyncFolder {
  return {
    id: "writing",
    label: "Writing",
    path: ROOT,
    state: "idle",
    completion: 100,
    needBytes: 0,
    needItems: 0,
    devices: [NAS],
    error: null,
    paused: false,
    failures: [],
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

describe("sync health (WP-4.3)", () => {
  const t0 = Date.parse("2026-09-14T10:00:00Z");

  it("says how long ago the NAS was last seen once it is offline", () => {
    const s = status({
      devices: [device({ connected: false, lastSeen: "2026-09-14T07:00:00Z" })],
    });
    expect(describeSync(s, ROOT, t0 - OFFLINE_AFTER_MS - 1, t0)).toBe("NAS offline · seen 3 h ago");
  });

  it("calls a paused folder or a paused NAS paused, not offline", () => {
    expect(describeSync(status({ folders: [folder({ paused: true })] }), ROOT)).toBe("Sync paused");
    expect(
      describeSync(status({ devices: [device({ paused: true, connected: false })] }), ROOT),
    ).toBe("Sync paused");
  });

  it("names files that will not sync rather than showing a percentage that never moves", () => {
    const stuck = folder({
      completion: 95,
      needItems: 4,
      failures: [{ path: "Old/", error: "directory not empty" }],
    });
    expect(describeSync(status({ folders: [stuck] }), ROOT)).toBe("Sync stuck · 1 file");
    const trouble = syncTrouble(status({ folders: [stuck] }), ROOT, {}, t0);
    expect(trouble?.kind).toBe("failures");
  });

  it("calls a connected sync stuck only after it has stopped moving for a while", () => {
    const slow = status({ folders: [folder({ completion: 95, needItems: 4 })] });
    let progress = trackProgress({}, slow, t0);
    expect(syncTrouble(slow, ROOT, progress, t0 + 60_000)).toBeNull();
    // Same percentage ten minutes later: stuck.
    progress = trackProgress(progress, slow, t0 + STALLED_AFTER_MS);
    expect(syncTrouble(slow, ROOT, progress, t0 + STALLED_AFTER_MS)?.kind).toBe("stalled");
    // Any movement starts the clock again.
    const moved = status({ folders: [folder({ completion: 96, needItems: 3 })] });
    progress = trackProgress(progress, moved, t0 + STALLED_AFTER_MS + 1);
    expect(syncTrouble(moved, ROOT, progress, t0 + STALLED_AFTER_MS + 2)).toBeNull();
  });

  it("never raises trouble for being offline: travelling is normal", () => {
    const away = status({
      devices: [device({ connected: false })],
      folders: [folder({ completion: 50, failures: [{ path: "a.md", error: "x" }] })],
    });
    expect(trackProgress({}, away, t0)).toEqual({});
    expect(syncTrouble(away, ROOT, {}, t0)).toBeNull();
  });

  it("puts a human time on last seen", () => {
    expect(seenAgo(null, t0)).toBeNull();
    expect(seenAgo("2026-09-14T09:59:30Z", t0)).toBe("just now");
    expect(seenAgo("2026-09-14T09:48:00Z", t0)).toBe("12 min ago");
    expect(seenAgo("2026-09-13T09:00:00Z", t0)).toBe("yesterday");
  });
});
