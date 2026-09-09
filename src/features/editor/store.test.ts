import { vi } from "vitest";

const ipc = { noteRead: vi.fn(), noteWrite: vi.fn() };
vi.mock("@/ipc", () => ({ commands: ipc }));
vi.mock("@/features/folio/store", () => ({ describeFolioError: (e: { kind: string }) => e.kind }));

const { useEditorStore, SAVE_DEBOUNCE_MS } = await import("./store");
const { markdownToDoc } = await import("@/lib/markdown");

beforeEach(() => {
  vi.useFakeTimers();
  ipc.noteRead.mockReset();
  ipc.noteWrite.mockReset();
  useEditorStore.setState({
    path: null,
    doc: null,
    mtime: null,
    dirty: false,
    conflict: null,
    externalChanged: false,
  });
});
afterEach(() => vi.useRealTimers());

describe("editor store", () => {
  it("opens a note, counts words, saves after the debounce with the read mtime", async () => {
    ipc.noteRead.mockResolvedValue({
      status: "ok",
      data: { path: "a.md", text: "# Hi\n\none two\n", mtime: 10, size: 1 },
    });
    ipc.noteWrite.mockResolvedValue({ status: "ok", data: { path: "a.md", mtime: 20, size: 1 } });
    expect(await useEditorStore.getState().open("a.md")).toBe(true);
    expect(useEditorStore.getState().words).toBe(3);
    useEditorStore.getState().changed(markdownToDoc("# Hi\n\none two three\n"));
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(useEditorStore.getState().words).toBe(4);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(ipc.noteWrite).toHaveBeenCalledWith("a.md", "# Hi\n\none two three\n", 10);
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().mtime).toBe(20);
  });

  it("coalesces rapid edits into one save", async () => {
    ipc.noteRead.mockResolvedValue({
      status: "ok",
      data: { path: "a.md", text: "", mtime: 1, size: 0 },
    });
    ipc.noteWrite.mockResolvedValue({ status: "ok", data: { path: "a.md", mtime: 2, size: 1 } });
    await useEditorStore.getState().open("a.md");
    for (let i = 0; i < 5; i += 1) {
      useEditorStore.getState().changed(markdownToDoc(`v${i}\n`));
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS / 2);
    }
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(ipc.noteWrite).toHaveBeenCalledTimes(1);
    expect(ipc.noteWrite.mock.calls[0]?.[1]).toBe("v4\n");
  });

  it("records a conflict when the disk moved and stops autosaving until resolved", async () => {
    ipc.noteRead.mockResolvedValue({
      status: "ok",
      data: { path: "a.md", text: "x\n", mtime: 1, size: 1 },
    });
    ipc.noteWrite.mockResolvedValue({
      status: "error",
      error: { kind: "conflict", detail: { disk_mtime: 99 } },
    });
    await useEditorStore.getState().open("a.md");
    useEditorStore.getState().changed(markdownToDoc("y\n"));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(useEditorStore.getState().conflict).toEqual({ diskMtime: 99 });
    useEditorStore.getState().changed(markdownToDoc("z\n"));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(ipc.noteWrite).toHaveBeenCalledTimes(1);
    ipc.noteWrite.mockResolvedValue({ status: "ok", data: { path: "a.md", mtime: 100, size: 1 } });
    expect(await useEditorStore.getState().overwriteDisk()).toBe(true);
    expect(ipc.noteWrite).toHaveBeenLastCalledWith("a.md", "z\n", null);
  });

  it("reloads silently when the disk changes and the note is clean, flags when dirty", async () => {
    ipc.noteRead.mockResolvedValue({
      status: "ok",
      data: { path: "a.md", text: "x\n", mtime: 1, size: 1 },
    });
    await useEditorStore.getState().open("a.md");
    ipc.noteRead.mockResolvedValue({
      status: "ok",
      data: { path: "a.md", text: "from disk\n", mtime: 2, size: 1 },
    });
    useEditorStore.getState().noteChangedOnDisk("a.md");
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState().mtime).toBe(2);
    useEditorStore.getState().changed(markdownToDoc("typing\n"));
    useEditorStore.getState().noteChangedOnDisk("a.md");
    expect(useEditorStore.getState().externalChanged).toBe(true);
    useEditorStore.getState().noteChangedOnDisk("other.md");
    expect(useEditorStore.getState().path).toBe("a.md");
  });
});
