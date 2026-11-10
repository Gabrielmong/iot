import type { Device } from "../generated/prisma/client.js";

/** An un-adopted device counts as offline when it hasn't been seen on the network for this long. */
export const TEST_OFFLINE_AFTER_MS = 5 * 60_000;

type TestFacts = Pick<Device, "kind" | "brand" | "secret" | "status" | "lastSeenAt">;

/**
 * Why the admin can't Test (switch on/off) a new device yet, or null when they can. Reasons are
 * checked in a fixed order so the most useful one shows (a keyless Tuya device asks for its key).
 */
export function testBlockedReason(device: TestFacts, now: Date): string | null {
  if (device.kind === "CAMERA") return "Cameras can't be switched";
  if (device.brand === "TUYA" && !device.secret) return "Needs the Tuya key first";
  if (device.brand === "KASA" && device.status === "NEEDS_CREDENTIALS") return "Needs TP-Link sign-in first";
  if (device.kind === "UNKNOWN") return "This kind of device can't be switched";
  if (!device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > TEST_OFFLINE_AFTER_MS) return "Device is offline";
  return null;
}
