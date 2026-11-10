import { PairingRejectedError, WrongPairingCodeError } from "../errors.js";
import type { DeviceRecord, Discovered, PairingMode, PairingSession, TvApp, TvCapability, TvKey } from "../types.js";
import { FakeDriver } from "./fake.js";

/** A FakeDriver that is also a TV: records keys and app launches, and pairs with `correctCode`. */
export class FakeTvDriver extends FakeDriver {
  readonly keys: { deviceId: string; key: TvKey }[] = [];
  readonly launches: { deviceId: string; app: TvApp }[] = [];
  readonly sessions: { cancelled: boolean }[] = [];
  /** Overrides sendKey (e.g. to hang). */
  sendKeyImpl?: () => Promise<void>;
  pairingMode: PairingMode = "CODE";
  correctCode = "1234";
  /** When set, startPairing waits for it (a TV slow to answer). */
  startPairingGate?: Promise<void>;
  /** When set, finish() rejects the pairing outright. */
  rejectPairing = false;
  appList: TvApp[] = ["YOUTUBE", "NETFLIX"];
  powerOn = true;
  /** What identify(ip) finds, by address. */
  readonly identifyAt: Record<string, Discovered> = {};

  async identify(ip: string): Promise<Discovered | undefined> {
    return this.identifyAt[ip];
  }

  readonly tv: TvCapability = {
    sendKey: async (device: DeviceRecord, key: TvKey) => {
      if (this.sendKeyImpl) await this.sendKeyImpl();
      this.keys.push({ deviceId: device.id, key });
    },
    launchApp: async (device: DeviceRecord, app: TvApp) => void this.launches.push({ deviceId: device.id, app }),
    apps: () => this.appList,
    canPowerOn: () => this.powerOn,
    startPairing: async () => {
      if (this.startPairingGate) await this.startPairingGate;
      return this.session();
    },
  };

  private session(): PairingSession {
    const state = { cancelled: false };
    this.sessions.push(state);
    return {
      mode: this.pairingMode,
      finish: async (code?: string) => {
        if (this.rejectPairing) throw new PairingRejectedError();
        if (this.pairingMode === "CODE" && code !== this.correctCode) throw new WrongPairingCodeError();
        return `secret-for-${code ?? "accept"}`;
      },
      cancel: () => void (state.cancelled = true),
    };
  }
}
