import {
  LAYOUT_PRESETS,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  migrateLayout,
  useLayoutStore,
} from "./store";

const s = () => useLayoutStore.getState();

beforeEach(() => s().setLayout("desk"));

describe("layout store", () => {
  it("desk pins the left panel, page pins nothing", () => {
    expect(s().left.pinned).toBe(true);
    s().toggleLayout();
    expect(s().layout).toBe("page");
    expect(s().left).toEqual(LAYOUT_PRESETS.page.left);
  });

  it("toggling a panel opens it as an overlay without pinning", () => {
    s().setLayout("page");
    s().togglePanel("right");
    expect(s().right.open).toBe(true);
    expect(s().right.pinned).toBe(false);
  });

  it("closeOverlays keeps pinned panels open", () => {
    s().togglePanel("right");
    s().closeOverlays();
    expect(s().right.open).toBe(false);
    expect(s().left.open).toBe(true);
  });

  it("pinning a closed panel opens it", () => {
    s().setLayout("page");
    s().setPinned("left", true);
    expect(s().left).toMatchObject({ open: true, pinned: true });
  });

  it("moves a device off a left view that no longer exists (WP-3.10)", () => {
    // Tags live under Search now, and the Daily strip under the Folio tree.
    expect(migrateLayout({ leftView: "tags" }, 1).leftView).toBe("search");
    expect(migrateLayout({ leftView: "daily" }, 1).leftView).toBe("folio");
    // The three that stayed are left alone, as is anything already migrated.
    expect(migrateLayout({ leftView: "boundings" }, 1).leftView).toBe("boundings");
    expect(migrateLayout({ leftView: "tags" }, 2).leftView).toBe("tags");
    expect(migrateLayout({}, 1).leftView).toBe("folio");
  });

  it("clamps widths", () => {
    s().setWidth("left", 10);
    expect(s().left.width).toBe(MIN_PANEL_WIDTH);
    s().setWidth("left", 9999);
    expect(s().left.width).toBe(MAX_PANEL_WIDTH);
  });
});
