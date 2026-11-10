import type { LightState, Rgb } from "@home/protocols";
import type { Brand, Device, DeviceKind, DeviceStatus, StreamSource } from "../generated/prisma/client.js";

export type { Brand, DeviceKind, DeviceStatus, StreamSource };

/** Live state of a device, kept in memory. `on` is for switches and plugs. */
export type DeviceState = { online: boolean; light?: LightState; on?: boolean /* switch/plug */ };

/** A requested change. Switches and plugs only use `on`. */
export type StatePatch = { on?: boolean; brightness?: number; color?: Rgb; colorTempK?: number };

/** A device seen on the LAN. `name` is a default for newly created records only. */
export type Discovered = {
  brand: Brand;
  externalId: string;
  ip: string;
  model?: string;
  name?: string;
  kind?: DeviceKind;
  config?: Record<string, unknown>;
  children?: { externalId: string; name: string }[];
  /** Where a camera's video comes from; only applied when the device is first created. */
  streamSource?: StreamSource;
};

/** An adopted device with its local key decrypted. */
export type DeviceRecord = Device & { secretPlain?: string /* decrypted local key */ };

export type DriverLog = Pick<Console, "info" | "warn" | "error">;

/** What a driver reports back to the manager. */
export interface DriverContext {
  discovered(d: Discovered): void;
  state(deviceId: string, s: DeviceState): void;
  status(deviceId: string, status: DeviceStatus): void;
  log: DriverLog;
}

/** The outcome of an on-demand discovery pass. */
export interface DiscoveryReport {
  /** Devices that answered but rejected the stored credentials. */
  authFailures: number;
}

export type TvKey = "POWER" | "VOLUME_UP" | "VOLUME_DOWN" | "MUTE" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "OK" | "BACK" | "HOME";
export type TvApp = "YOUTUBE" | "NETFLIX" | "PRIME_VIDEO" | "DISNEY_PLUS" | "SPOTIFY";
/** CODE: the TV shows a code the admin types in. ACCEPT_ON_TV: someone accepts a prompt on the TV. */
export type PairingMode = "CODE" | "ACCEPT_ON_TV";

/** An open pairing exchange with one TV. */
export interface PairingSession {
  mode: PairingMode;
  /**
   * Completes pairing and resolves with the plain secret to store. Throws WrongPairingCodeError (the
   * session stays usable) or PairingRejectedError.
   */
  finish(code?: string): Promise<string>;
  /** Closes the exchange; safe to call more than once. */
  cancel(): void;
}

/** What a TV driver adds: remote keys, app launch and pairing. */
export interface TvCapability {
  sendKey(device: DeviceRecord, key: TvKey): Promise<void>;
  launchApp(device: DeviceRecord, app: TvApp): Promise<void>;
  /** The app shortcuts this TV can open. */
  apps(device: DeviceRecord): TvApp[];
  /** Whether the TV can be turned on from standby (otherwise only off). */
  canPowerOn(device: DeviceRecord): boolean;
  startPairing(device: DeviceRecord): Promise<PairingSession>;
}

/** One brand's LAN integration. */
export interface Driver {
  brand: Brand;
  start(ctx: DriverContext): Promise<void>;
  stop(): Promise<void>;
  /** Adopted devices of this brand, with decrypted secrets. Replaces the previous set. */
  sync(devices: DeviceRecord[]): Promise<void>;
  /** Throws DeviceNotReadyError when the device cannot be controlled; any other error means unreachable. */
  setState(device: DeviceRecord, patch: StatePatch): Promise<void>;
  /** Optional: discovers and identifies devices now (e.g. right after new credentials are stored). */
  discoverNow?(): Promise<DiscoveryReport>;
  /** TV drivers only. */
  tv?: TvCapability;
  /** Optional: identifies a device of this brand at an IP (for adding by hand), or undefined. */
  identify?(ip: string): Promise<Discovered | undefined>;
}
