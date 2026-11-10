import { EventEmitter } from "node:events";

/** Fired when who may use a device changes. Listeners run synchronously inside mutations and must never throw. */
export interface GrantEvents {
  /** A device's set of granted users changed (grant or revoke). */
  grantsChanged: [deviceId: string];
  /** A device was deleted (its grants went with it). */
  deviceRemoved: [deviceId: string];
}

/** A small typed event source; consumers (e.g. camera revocation) subscribe with `on`. */
export interface GrantEventSource {
  on<K extends keyof GrantEvents>(event: K, listener: (...args: GrantEvents[K]) => void): this;
  off<K extends keyof GrantEvents>(event: K, listener: (...args: GrantEvents[K]) => void): this;
  emit<K extends keyof GrantEvents>(event: K, ...args: GrantEvents[K]): boolean;
}

export const createGrantEvents = (): GrantEventSource => new EventEmitter() as GrantEventSource;
