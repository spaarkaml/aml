import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";

vi.mock("@/ipc", () => ({
  commands: {
    appInfo: vi.fn().mockResolvedValue({
      name: "AML",
      version: "0.1.0",
      platform: "test",
      arch: "x",
      debug: true,
    }),
  },
}));

describe("App", () => {
  it("renders the wordmark and app info from the Rust bridge", async () => {
    render(<App />);
    expect(screen.getByText("AML")).toBeInTheDocument();
    expect(await screen.findByTestId("app-info")).toHaveTextContent("v0.1.0");
  });
});
