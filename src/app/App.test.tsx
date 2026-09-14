import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { useLayoutStore } from "@/features/layout/store";
import { App } from "./App";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/ipc", () => ({
  commands: {
    appInfo: vi.fn().mockResolvedValue({
      name: "AML",
      version: "0.1.0",
      platform: "test",
      arch: "x",
      debug: true,
    }),
    folioCurrent: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    // No recents: a first run, which is the only time Welcome is the launch screen.
    folioRecent: vi.fn().mockResolvedValue([]),
    syncStatus: vi
      .fn()
      .mockResolvedValue({ status: "ok", data: { enabled: false, devices: [], folders: [] } }),
  },
  events: { folioChanged: { listen: vi.fn().mockResolvedValue(() => undefined) } },
}));

beforeEach(() => useLayoutStore.getState().setLayout("desk"));

describe("App shell", () => {
  it("renders wordmark, status info and the pinned Browser in Desk layout", async () => {
    render(<App />);
    // The shell renders nothing in the centre until bootstrap has decided where to land.
    expect(await screen.findByText("A meaningful life")).toBeInTheDocument();
    expect(await screen.findByTestId("app-info")).toHaveTextContent("v0.1.0");
    expect(screen.getByTestId("panel-left")).toHaveAttribute("data-pinned", "true");
    expect(screen.queryByTestId("panel-right")).not.toBeInTheDocument();
  });

  it("switches to Page layout with the shortcut and opens the right panel as an overlay", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "L", metaKey: true, shiftKey: true, ctrlKey: false });
    if (useLayoutStore.getState().layout === "desk") {
      // non-mac test env: mod = ctrl
      fireEvent.keyDown(window, { key: "L", ctrlKey: true, shiftKey: true });
    }
    expect(useLayoutStore.getState().layout).toBe("page");
    expect(screen.queryByTestId("panel-left")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Context/));
    expect(screen.getByTestId("panel-right")).toHaveAttribute("data-pinned", "false");
    fireEvent.mouseDown(screen.getByTestId("overlay-backdrop"));
    expect(screen.queryByTestId("panel-right")).not.toBeInTheDocument();
  });

  it("opens the command palette from the top bar", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle(/Commands/));
    expect(screen.getByTestId("palette-input")).toBeInTheDocument();
  });
});
