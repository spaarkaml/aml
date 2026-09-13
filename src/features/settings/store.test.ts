import { vi } from "vitest";

const ipc = {
  preferencesRead: vi.fn(),
  preferencesWrite: vi.fn(),
  dailyDates: vi.fn(),
  folioTree: vi.fn(),
  snapshotsUsage: vi.fn(),
};
vi.mock("@/ipc", () => ({ commands: ipc }));

const { useSettingsStore, DEFAULT_DAILY_FOLDER } = await import("./store");

const s = () => useSettingsStore.getState();

beforeEach(() => {
  for (const fn of Object.values(ipc)) fn.mockReset();
  ipc.dailyDates.mockResolvedValue({ status: "ok", data: [] });
  ipc.folioTree.mockResolvedValue({ status: "ok", data: [] });
  ipc.snapshotsUsage.mockResolvedValue({ status: "ok", data: { count: 3, bytes: 900 } });
  useSettingsStore.setState({
    open: false,
    dailyFolder: "",
    dailyGoal: "",
    error: null,
    saved: false,
    keepAllDays: "",
    keepDailyDays: "",
    snapshotUsage: null,
  });
});

describe("settings store", () => {
  it("reads the Folio's Daily folder, and shows nothing when it has none", async () => {
    ipc.preferencesRead.mockResolvedValue({
      status: "ok",
      data: { dailyFolder: "Notes/Days", dailyGoal: 500 },
    });
    await s().load();
    expect(s().dailyFolder).toBe("Notes/Days");
    expect(s().dailyGoal).toBe("500");

    ipc.preferencesRead.mockResolvedValue({
      status: "ok",
      data: { dailyFolder: null, dailyGoal: null },
    });
    await s().load();
    // Empty, not "journal": the field shows what the Folio said, and the default is a hint.
    expect(s().dailyFolder).toBe("");
    // No goal is empty, not zero: a goal you did not set is not one you are failing.
    expect(s().dailyGoal).toBe("");
    expect(DEFAULT_DAILY_FOLDER).toBe("journal");
  });

  it("saves the folder Rust tidied rather than what was typed", async () => {
    ipc.preferencesWrite.mockResolvedValue({
      status: "ok",
      data: { dailyFolder: "Days", dailyGoal: null },
    });
    s().setDailyFolder(" /Days/ ");
    expect(await s().save()).toBe(true);
    expect(ipc.preferencesWrite).toHaveBeenCalledWith({
      dailyFolder: "/Days/",
      dailyGoal: null,
      snapshotKeepAllDays: null,
      snapshotKeepDailyDays: null,
    });
    expect(s().dailyFolder).toBe("Days");
    expect(s().saved).toBe(true);
    // The strip and the tree both look somewhere else from now on.
    expect(ipc.dailyDates).toHaveBeenCalled();
    expect(ipc.folioTree).toHaveBeenCalled();
  });

  it("clearing the field sends nothing at all, so the default applies again", async () => {
    ipc.preferencesWrite.mockResolvedValue({
      status: "ok",
      data: { dailyFolder: null, dailyGoal: null },
    });
    s().setDailyFolder("   ");
    expect(await s().save()).toBe(true);
    expect(ipc.preferencesWrite).toHaveBeenCalledWith({
      dailyFolder: null,
      dailyGoal: null,
      snapshotKeepAllDays: null,
      snapshotKeepDailyDays: null,
    });
    expect(s().dailyFolder).toBe("");
  });

  it("sends a daily goal as a number, and nothing at all for no goal", async () => {
    ipc.preferencesWrite.mockResolvedValue({
      status: "ok",
      data: { dailyFolder: null, dailyGoal: 500 },
    });
    s().setDailyGoal("500");
    await s().save();
    expect(ipc.preferencesWrite).toHaveBeenCalledWith({
      dailyFolder: null,
      dailyGoal: 500,
      snapshotKeepAllDays: null,
      snapshotKeepDailyDays: null,
    });
    expect(s().dailyGoal).toBe("500");

    ipc.preferencesWrite.mockResolvedValue({
      status: "ok",
      data: { dailyFolder: null, dailyGoal: null },
    });
    s().setDailyGoal("0");
    await s().save();
    expect(ipc.preferencesWrite).toHaveBeenLastCalledWith({
      dailyFolder: null,
      dailyGoal: null,
      snapshotKeepAllDays: null,
      snapshotKeepDailyDays: null,
    });
    expect(s().dailyGoal).toBe("");
  });

  it("reads and sends snapshot retention, and how much room Snapshots take", async () => {
    ipc.preferencesRead.mockResolvedValue({
      status: "ok",
      data: {
        dailyFolder: null,
        dailyGoal: null,
        snapshotKeepAllDays: 14,
        snapshotKeepDailyDays: null,
      },
    });
    await s().load();
    expect(s().keepAllDays).toBe("14");
    expect(s().keepDailyDays).toBe("");
    expect(s().snapshotUsage).toEqual({ count: 3, bytes: 900 });

    ipc.preferencesWrite.mockResolvedValue({
      status: "ok",
      data: {
        dailyFolder: null,
        dailyGoal: null,
        snapshotKeepAllDays: 14,
        snapshotKeepDailyDays: 30,
      },
    });
    s().setKeepDailyDays("30.4");
    s().setKeepAllDays("0");
    await s().save();
    // Zero is not a retention: it goes back to AML's own rather than keeping nothing.
    expect(ipc.preferencesWrite).toHaveBeenLastCalledWith({
      dailyFolder: null,
      dailyGoal: null,
      snapshotKeepAllDays: null,
      snapshotKeepDailyDays: 30,
    });
    expect(s().keepAllDays).toBe("14");
  });

  it("keeps a refused folder on screen with the reason", async () => {
    ipc.preferencesWrite.mockResolvedValue({
      status: "error",
      error: { kind: "invalidPath", detail: "../elsewhere" },
    });
    s().setDailyFolder("../elsewhere");
    expect(await s().save()).toBe(false);
    expect(s().error).toContain("../elsewhere");
    expect(s().dailyFolder).toBe("../elsewhere");
    // Typing again clears the complaint rather than leaving it under a corrected value.
    s().setDailyFolder("Days");
    expect(s().error).toBeNull();
  });
});
