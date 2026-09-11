import { vi } from "vitest";

const ipc = { typesList: vi.fn(), typesByNote: vi.fn(), typeWrite: vi.fn() };
vi.mock("@/ipc", () => ({ commands: ipc }));

const { useTypesStore, typeSlug, WRITE_DEBOUNCE_MS } = await import("./store");

const chapter = {
  id: "chapter",
  name: "Chapter",
  colour: "#006078",
  icon: "",
  template: "Chapter",
  fields: ["status", "pov"],
  notes: 2,
  custom: false,
};

const s = () => useTypesStore.getState();

beforeEach(() => {
  for (const fn of Object.values(ipc)) fn.mockReset();
  useTypesStore.setState({ list: [], byNote: {} });
});

describe("note types store", () => {
  it("mirrors the ids Rust writes into front matter", () => {
    expect(typeSlug("Plot Thread")).toBe("plot-thread");
    expect(typeSlug("  Source__note ")).toBe("source-note");
    expect(typeSlug("!!!")).toBe("");
  });

  it("loads the types and the note→type map together", async () => {
    ipc.typesList.mockResolvedValue({ status: "ok", data: [chapter] });
    ipc.typesByNote.mockResolvedValue({ status: "ok", data: { "Thesis/03.md": "chapter" } });
    await s().refresh();
    expect(s().list).toEqual([chapter]);
    expect(s().ofNote("Thesis/03.md")).toEqual(chapter);
    // A note with no type, and a type nothing knows about, are both simply nothing.
    expect(s().ofNote("Inbox.md")).toBeNull();
    expect(s().find("character")).toBeNull();
  });

  it("finds a type however the note spelled it", async () => {
    ipc.typesList.mockResolvedValue({ status: "ok", data: [{ ...chapter, id: "plot-thread" }] });
    ipc.typesByNote.mockResolvedValue({ status: "ok", data: {} });
    await s().refresh();
    expect(s().find("Plot Thread")?.id).toBe("plot-thread");
  });

  it("shows a colour change at once and writes it once the dragging stops", async () => {
    vi.useFakeTimers();
    useTypesStore.setState({ list: [chapter] });
    ipc.typeWrite.mockResolvedValue({
      status: "ok",
      data: [{ ...chapter, colour: "#7a5c9e", custom: true }],
    });

    const first = s().save({ ...chapter, colour: "#111111" });
    const settled = s().save({ ...chapter, colour: "#7a5c9e" });
    // The list has already moved, so the tree repaints with the well rather than after it.
    expect(s().list[0]?.colour).toBe("#7a5c9e");
    expect(ipc.typeWrite).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);
    await Promise.all([first, settled]);
    // One write for the whole drag, carrying the colour it ended on.
    expect(ipc.typeWrite).toHaveBeenCalledTimes(1);
    expect(ipc.typeWrite).toHaveBeenCalledWith(expect.objectContaining({ colour: "#7a5c9e" }));
    expect(s().list[0]?.custom).toBe(true);
    vi.useRealTimers();
  });
});
