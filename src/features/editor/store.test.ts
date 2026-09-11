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

  it("reloads a clean note from disk, and leaves a dirty one alone", async () => {
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
    // A dirty note is left as it is: our own save trips the watcher the same way a foreign
    // edit does, so a warning raised from this event fires on every pause in typing. What
    // the user typed stays, and nothing is re-read behind them.
    useEditorStore.getState().changed(markdownToDoc("typing\n"));
    ipc.noteRead.mockClear();
    useEditorStore.getState().noteChangedOnDisk("a.md");
    await vi.advanceTimersByTimeAsync(0);
    expect(ipc.noteRead).not.toHaveBeenCalled();
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(useEditorStore.getState().conflict).toBeNull();

    useEditorStore.getState().noteChangedOnDisk("other.md");
    expect(useEditorStore.getState().path).toBe("a.md");
  });

  it("raises the conflict from the file itself when a save is refused", async () => {
    ipc.noteRead.mockResolvedValue({
      status: "ok",
      data: { path: "a.md", text: "x\n", mtime: 1, size: 1 },
    });
    await useEditorStore.getState().open("a.md");
    // Something else writes the note while we are typing. The watcher event alone does
    // nothing; the next save compares mtimes on disk and is refused, and that is the banner.
    useEditorStore.getState().changed(markdownToDoc("mine\n"));
    useEditorStore.getState().noteChangedOnDisk("a.md");
    expect(useEditorStore.getState().conflict).toBeNull();
    ipc.noteWrite.mockResolvedValue({
      status: "error",
      error: { kind: "conflict", detail: { disk_mtime: 42 } },
    });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(useEditorStore.getState().conflict).toEqual({ diskMtime: 42 });
  });
});
