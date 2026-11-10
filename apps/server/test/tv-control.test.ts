import { describe, expect, it, vi } from "vitest";
import { TvControl } from "../src/devices/tv-control.js";
import type { DeviceRecord, PairingSession, TvCapability } from "../src/devices/types.js";
import { TimeoutError } from "../src/devices/with-timeout.js";

describe("TvControl.startPairing", () => {
  it("closes a session that opens after the start already timed out", async () => {
    const session: PairingSession = { mode: "CODE", finish: async () => "", cancel: vi.fn() };
    let open!: (s: PairingSession) => void;
    const tv = { startPairing: () => new Promise<PairingSession>((r) => (open = r)) } as unknown as TvCapability;
    const device = { id: "tv1", kind: "TV", brand: "ANDROID_TV" } as unknown as DeviceRecord;
    const control = new TvControl({
      records: { byId: async () => device } as never,
      tvFor: () => tv,
      log: { info() {}, warn() {}, error() {} } as never,
      commandTimeoutMs: 3000,
      onUnreachable: () => {},
      pairingStartTimeoutMs: 20,
    });
    await expect(control.startPairing("tv1")).rejects.toBeInstanceOf(TimeoutError);
    open(session);
    await new Promise((r) => setTimeout(r, 0));
    expect(session.cancel).toHaveBeenCalledOnce();
  });
});
