import { describe, expect, it } from "vitest";
import { toLayoutItems, validateLayoutItems, type LayoutItem } from "../src/services/layout-items.js";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { extensions?: { code?: string } }).extensions?.code;
  }
  return undefined;
};

describe("validateLayoutItems", () => {
  it("rejects a device listed twice", () => {
    expect(code(() => validateLayoutItems([{ deviceId: "a", size: "S1x1" }, { deviceId: "a", size: "L2x2" }]))).toBe("BAD_USER_INPUT");
  });

  it("allows 500 items and rejects 501", () => {
    const items = (n: number): LayoutItem[] => Array.from({ length: n }, (_, i) => ({ deviceId: `d${i}`, size: "S1x1" }));
    expect(validateLayoutItems(items(500))).toHaveLength(500);
    expect(code(() => validateLayoutItems(items(501)))).toBe("BAD_USER_INPUT");
  });

  it("returns valid input unchanged", () => {
    const items: LayoutItem[] = [{ deviceId: "b", size: "W2x1" }, { deviceId: "a", size: "T1x2" }];
    expect(validateLayoutItems(items)).toEqual(items);
  });

  it("accepts widgets next to devices", () => {
    const items: LayoutItem[] = [{ widget: "WEATHER", widgetId: "WEATHER", size: "W2x1" }, { deviceId: "a", size: "S1x1" }, { widget: "SUN", widgetId: "SUN", size: "S1x1" }];
    expect(validateLayoutItems(items)).toEqual(items);
  });

  it("rejects an item with both a device and a widget, or neither", () => {
    expect(code(() => validateLayoutItems([{ deviceId: "a", widget: "SUN", size: "S1x1" } as unknown as LayoutItem]))).toBe("BAD_USER_INPUT");
    expect(code(() => validateLayoutItems([{ size: "S1x1" } as unknown as LayoutItem]))).toBe("BAD_USER_INPUT");
  });

  it("rejects the same widget instance listed twice", () => {
    expect(code(() => validateLayoutItems([{ widget: "WEATHER", widgetId: "w", size: "S1x1" }, { widget: "WEATHER", widgetId: "w", size: "L2x2" }]))).toBe("BAD_USER_INPUT");
  });

  it("allows several widgets of one kind with different ids", () => {
    const items: LayoutItem[] = [
      { widget: "ROUTINE", widgetId: "a", targetId: "r1", size: "S1x1" },
      { widget: "ROUTINE", widgetId: "b", targetId: "r2", size: "S1x1" },
    ];
    expect(validateLayoutItems(items)).toEqual(items);
  });

  it("requires a target for routine, camera and room widgets, and refuses one elsewhere", () => {
    for (const widget of ["ROUTINE", "CAMERA", "ROOM"] as const) {
      expect(code(() => validateLayoutItems([{ widget, widgetId: "w", size: "S1x1" }]))).toBe("BAD_USER_INPUT");
    }
    expect(code(() => validateLayoutItems([{ widget: "CLOCK", widgetId: "w", targetId: "x", size: "W2x1" }]))).toBe("BAD_USER_INPUT");
  });
});

describe("toLayoutItems", () => {
  it("keeps the widget id and target", () => {
    expect(toLayoutItems([{ widget: "CAMERA", widgetId: "w1", targetId: "cam", size: "L2x2" }])).toEqual([{ widget: "CAMERA", widgetId: "w1", targetId: "cam", size: "L2x2" }]);
  });

  it("gives a widget without an id its kind as id, and drops a null target", () => {
    expect(toLayoutItems([{ widget: "MOON", widgetId: null, targetId: null, size: "S1x1" }])).toEqual([{ widget: "MOON", widgetId: "MOON", size: "S1x1" }]);
  });
});
