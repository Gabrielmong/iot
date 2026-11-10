import { describe, expect, it } from "vitest";
import { testBlockedReason } from "../src/services/test-reason.js";

const now = new Date("2026-11-07T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const plug = { kind: "PLUG" as const, brand: "KASA" as const, secret: null, status: "OK" as const, lastSeenAt: minutesAgo(1) };

describe("testBlockedReason", () => {
  it("says cameras can't be switched, before any other reason", () => {
    expect(testBlockedReason({ ...plug, kind: "CAMERA", brand: "TUYA", lastSeenAt: null }, now)).toBe("Cameras can't be switched");
  });

  it("asks for the Tuya key before calling an unknown Tuya device unswitchable", () => {
    expect(testBlockedReason({ ...plug, kind: "UNKNOWN", brand: "TUYA" }, now)).toBe("Needs the Tuya key first");
  });

  it("asks for TP-Link sign-in when Kasa needs credentials", () => {
    expect(testBlockedReason({ ...plug, status: "NEEDS_CREDENTIALS" }, now)).toBe("Needs TP-Link sign-in first");
  });

  it("calls unknown kinds unswitchable", () => {
    expect(testBlockedReason({ ...plug, kind: "UNKNOWN" }, now)).toBe("This kind of device can't be switched");
  });

  it("calls a device offline when not seen for 5 minutes", () => {
    expect(testBlockedReason({ ...plug, lastSeenAt: minutesAgo(6) }, now)).toBe("Device is offline");
    expect(testBlockedReason({ ...plug, lastSeenAt: null }, now)).toBe("Device is offline");
    expect(testBlockedReason({ ...plug, lastSeenAt: minutesAgo(4) }, now)).toBeNull();
  });

  it("allows a Tuya device that has its key", () => {
    expect(testBlockedReason({ ...plug, brand: "TUYA", secret: "enc" }, now)).toBeNull();
  });
});
