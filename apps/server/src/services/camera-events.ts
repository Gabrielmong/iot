import { EventEmitter } from "node:events";

/** Fired when what feeds a camera's video changes. Listeners run synchronously inside mutations and must never throw. */
export interface CameraEvents {
  /** The camera's stream source changed (e.g. Tuya cloud ⇄ local ONVIF); its current media must end. */
  sourceChanged: [deviceId: string];
}

export interface CameraEventSource {
  on<K extends keyof CameraEvents>(event: K, listener: (...args: CameraEvents[K]) => void): this;
  off<K extends keyof CameraEvents>(event: K, listener: (...args: CameraEvents[K]) => void): this;
  emit<K extends keyof CameraEvents>(event: K, ...args: CameraEvents[K]): boolean;
}

export const createCameraEvents = (): CameraEventSource => new EventEmitter() as CameraEventSource;
