import { describe, expect, it } from "vitest";
import { titleBarKind } from "./titleBar";

describe("the merged title bar", () => {
  it("overlays the traffic lights on a Mac and draws its own buttons on Windows", () => {
    expect(titleBarKind("MacIntel", true)).toBe("mac");
    expect(titleBarKind("Win32", true)).toBe("windows");
  });

  it("merges nothing outside the app, or on a system it has no plan for", () => {
    expect(titleBarKind("MacIntel", false)).toBe("none");
    expect(titleBarKind("Win32", false)).toBe("none");
    expect(titleBarKind("Linux x86_64", true)).toBe("none");
  });
});
