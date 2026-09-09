import { vi } from "vitest";

const openDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...a: unknown[]) => openDialog(...a) }));

const ipc = {
  folioCurrent: vi.fn(),
  folioRecent: vi.fn(),
  folioOpen: vi.fn(),
  folioCreate: vi.fn(),
  folioTree: vi.fn(),
  folioClose: vi.fn(),
};
vi.mock("@/ipc", () => ({ commands: ipc }));

const { useFolioStore, describeFolioError } = await import("./store");

const info = { root: "/f", name: "f", noteCount: 1 };

beforeEach(() => {
  for (const fn of Object.values(ipc)) fn.mockReset();
  ipc.folioRecent.mockResolvedValue([]);
  ipc.folioTree.mockResolvedValue({ status: "ok", data: [] });
  ipc.folioClose.mockResolvedValue({ status: "ok", data: null });
  useFolioStore.setState({ folio: null, tree: [], error: null, pendingCreate: null, busy: false });
});

describe("folio store", () => {
  it("opens a Folio and loads the tree", async () => {
    ipc.folioOpen.mockResolvedValue({ status: "ok", data: info });
    ipc.folioTree.mockResolvedValue({
      status: "ok",
      data: [{ name: "a.md", path: "a.md", kind: "note", mtime: 1, size: 1, children: [] }],
    });
    expect(await useFolioStore.getState().openPath("/f")).toBe(true);
    expect(useFolioStore.getState().folio).toEqual(info);
    expect(useFolioStore.getState().tree).toHaveLength(1);
  });

  it("offers creation when the folder is not a Folio", async () => {
    ipc.folioOpen.mockResolvedValue({
      status: "error",
      error: { kind: "notAFolio", detail: "/x" },
    });
    expect(await useFolioStore.getState().openPath("/x")).toBe(false);
    expect(useFolioStore.getState().pendingCreate).toBe("/x");
    expect(useFolioStore.getState().error).toMatch(/not a Folio/);
    ipc.folioCreate.mockResolvedValue({ status: "ok", data: info });
    expect(await useFolioStore.getState().createAt("/x")).toBe(true);
    expect(useFolioStore.getState().pendingCreate).toBeNull();
  });

  it("pickAndOpen uses the native folder dialog and ignores cancel", async () => {
    openDialog.mockResolvedValueOnce(null);
    await useFolioStore.getState().pickAndOpen();
    expect(ipc.folioOpen).not.toHaveBeenCalled();
    openDialog.mockResolvedValueOnce("/picked");
    ipc.folioOpen.mockResolvedValue({ status: "ok", data: info });
    await useFolioStore.getState().pickAndOpen();
    expect(ipc.folioOpen).toHaveBeenCalledWith("/picked");
  });

  it("describes every error kind in plain language", () => {
    expect(describeFolioError({ kind: "conflict", detail: { disk_mtime: 5 } })).toMatch(
      /changed on disk/,
    );
    expect(describeFolioError({ kind: "io", detail: "boom" })).toMatch(/boom/);
    expect(describeFolioError({ kind: "noFolioOpen" })).toMatch(/No Folio/);
  });
});
