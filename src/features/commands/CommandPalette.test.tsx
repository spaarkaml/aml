import { fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { usePaletteStore } from "./paletteStore";
import { commandRegistry } from "./registry";

describe("CommandPalette", () => {
  it("filters commands and runs the selected one on Enter", async () => {
    const ran: string[] = [];
    const off = commandRegistry.register(
      { id: "t.layout", title: "Toggle Layout", group: "View", run: () => ran.push("layout") },
      { id: "t.snap", title: "Take Snapshot", run: () => ran.push("snap") },
    );
    usePaletteStore.getState().setOpen(true);
    render(<CommandPalette />);
    const input = await screen.findByTestId("palette-input");
    fireEvent.change(input, { target: { value: "snap" } });
    expect(screen.getByText("Take Snapshot")).toBeInTheDocument();
    expect(screen.queryByText("Toggle Layout")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ran).toEqual(["snap"]);
    expect(usePaletteStore.getState().open).toBe(false);
    off();
  });

  it("closes on Escape", async () => {
    usePaletteStore.getState().setOpen(true);
    render(<CommandPalette />);
    fireEvent.keyDown(await screen.findByTestId("palette-input"), { key: "Escape" });
    expect(usePaletteStore.getState().open).toBe(false);
  });
});
