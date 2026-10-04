import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoPopover, placePopover, wrapFocus } from "./info-popover";
import { ExpandRow } from "./expand-row";
import { Tabs, nextTab } from "./tabs";

const vp = { width: 1280, height: 720 };

describe("placePopover", () => {
  it("opens below the button when it fits", () => {
    expect(placePopover({ left: 100, top: 100, width: 20, height: 20 }, { width: 300, height: 120 }, vp)).toEqual({ top: 128, left: 100 });
  });
  it("flips above when there is no room below", () => {
    const p = placePopover({ left: 100, top: 650, width: 20, height: 20 }, { width: 300, height: 200 }, vp);
    expect(p.top).toBe(650 - 8 - 200);
  });
  it("clamps inside the viewport on the right edge and never goes off-screen", () => {
    const p = placePopover({ left: 1270, top: 10, width: 20, height: 20 }, { width: 340, height: 100 }, vp);
    expect(p.left).toBe(1280 - 12 - 340);
    expect(p.top).toBeGreaterThanOrEqual(12);
  });
});

describe("keyboard helpers", () => {
  it("wrapFocus cycles Tab and Shift+Tab inside the popover", () => {
    expect(wrapFocus(2, 1, false)).toBe(0);
    expect(wrapFocus(2, 0, true)).toBe(1);
    expect(wrapFocus(3, -1, false)).toBe(0);
    expect(wrapFocus(3, -1, true)).toBe(2);
    expect(wrapFocus(0, -1, false)).toBe(-1);
  });
  it("nextTab follows the WAI-ARIA tabs pattern", () => {
    expect(nextTab(3, 0, "ArrowRight")).toBe(1);
    expect(nextTab(3, 2, "ArrowRight")).toBe(0);
    expect(nextTab(3, 0, "ArrowLeft")).toBe(2);
    expect(nextTab(3, 1, "Home")).toBe(0);
    expect(nextTab(3, 0, "End")).toBe(2);
    expect(nextTab(3, 0, "a")).toBeNull();
  });
});

describe("markup and accessible names", () => {
  it("InfoPopover button has a name, announces a dialog, and starts collapsed", () => {
    const html = renderToStaticMarkup(h(InfoPopover, { label: "floor", children: "Hidden text" }));
    expect(html).toContain('aria-label="More about floor"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("Hidden text");
  });
  it("ExpandRow hides the long text until asked, keeps it in the DOM, and wires aria-controls", () => {
    const html = renderToStaticMarkup(h(ExpandRow, { lead: h("span", null, "Short"), label: "ack 1", children: "Long original wording" }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Long original wording");
    expect(html).toMatch(/aria-controls="([^"]+)"/);
    const id = /aria-controls="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/class="xr-body[^"]*" hidden/);
    expect(html).toContain('aria-label="More: ack 1"');
  });
  it("Tabs: one tab in the tab order, others hidden panels", () => {
    const html = renderToStaticMarkup(h(Tabs, { label: "x", items: [{ id: "a", label: "A", panel: "pa" }, { id: "b", label: "B", panel: "pb" }] }));
    expect(html).toContain('role="tablist"');
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(3); // selected tab + both panels (a hidden panel is never focusable)
    expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(1);
    expect((html.match(/ hidden=""/g) ?? []).length).toBe(1);
  });
});
