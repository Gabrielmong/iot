import { describe, expect, it } from "vitest";
import { WAKE_INTENT_MS, WakeIntent } from "../src/devices/drivers/wake-intent.js";

describe("WakeIntent", () => {
  it("asks for POWER only on the first dark report after a recent wake", () => {
    let now = 0;
    const intent = new WakeIntent(() => now);
    expect(intent.consume(false)).toBe(false);
    intent.request();
    expect(intent.consume(false)).toBe(true);
    expect(intent.consume(false)).toBe(false);
    intent.request();
    expect(intent.consume(true)).toBe(false);
    intent.request();
    now += WAKE_INTENT_MS + 1;
    expect(intent.consume(false)).toBe(false);
  });
});
