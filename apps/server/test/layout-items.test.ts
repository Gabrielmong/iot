import { describe, expect, it } from "vitest";
import { validateLayoutItems, type LayoutItem } from "../src/services/layout-items.js";

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
});
