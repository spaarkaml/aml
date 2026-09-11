import { vi } from "vitest";

const ipc = {
  preferencesRead: vi.fn(),
  preferencesWrite: vi.fn(),
  dailyDates: vi.fn(),
  folioTree: vi.fn(),
};
vi.mock("@/ipc", () => ({ commands: ipc }));

const { useSettingsStore, DEFAULT_DAILY_FOLDER } = await import("./store");

const s = () => useSettingsStore.getState();

beforeEach(() => {
  for (const fn of Object.values(ipc)) fn.mockReset();
  ipc.dailyDates.mockResolvedValue({ status: "ok", data: [] });
  ipc.folioTree.mockResolvedValue({ status: "ok", data: [] });
  useSettingsStore.setState({ open: false, dailyFolder: "", error: null, saved: false });
});

describe("settings store", () => {
  it("reads the Folio's Daily folder, and shows nothing when it has none", async () => {
    ipc.preferencesRead.mockResolvedValue({ status: "ok", data: { dailyFolder: "Notes/Days" } });
    await s().load();
    expect(s().dailyFolder).toBe("Notes/Days");

    ipc.preferencesRead.mockResolvedValue({ status: "ok", data: { dailyFolder: null } });
    await s().load();
    // Empty, not "journal": the field shows what the Folio said, and the default is a hint.
    expect(s().dailyFolder).toBe("");
    expect(DEFAULT_DAILY_FOLDER).toBe("journal");
  });

  it("saves the folder Rust tidied rather than what was typed", async () => {
    ipc.preferencesWrite.mockResolvedValue({ status: "ok", data: { dailyFolder: "Days" } });
    s().setDailyFolder(" /Days/ ");
    expect(await s().save()).toBe(true);
    expect(ipc.preferencesWrite).toHaveBeenCalledWith({ dailyFolder: "/Days/" });
    expect(s().dailyFolder).toBe("Days");
    expect(s().saved).toBe(true);
    // The strip and the tree both look somewhere else from now on.
    expect(ipc.dailyDates).toHaveBeenCalled();
    expect(ipc.folioTree).toHaveBeenCalled();
  });

  it("clearing the field sends nothing at all, so the default applies again", async () => {
    ipc.preferencesWrite.mockResolvedValue({ status: "ok", data: { dailyFolder: null } });
    s().setDailyFolder("   ");
    expect(await s().save()).toBe(true);
    expect(ipc.preferencesWrite).toHaveBeenCalledWith({ dailyFolder: null });
    expect(s().dailyFolder).toBe("");
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
