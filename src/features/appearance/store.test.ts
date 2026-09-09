import { resolveMode, useAppearanceStore } from "./store";

describe("appearance", () => {
  it("resolves system to the OS preference", () => {
    expect(resolveMode("system", true)).toBe("ink");
    expect(resolveMode("system", false)).toBe("paper");
    expect(resolveMode("ink", false)).toBe("ink");
  });
  it("cycles system → paper → ink → system", () => {
    const s = useAppearanceStore.getState;
    s().setSetting("system");
    s().cycle();
    expect(s().setting).toBe("paper");
    s().cycle();
    expect(s().setting).toBe("ink");
    s().cycle();
    expect(s().setting).toBe("system");
  });
});
