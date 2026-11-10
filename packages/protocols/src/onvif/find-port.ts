import { cameraUtcTime } from './device-service.js';
import { OnvifAuthError, OnvifUnreachableError } from './errors.js';

/** Ports ONVIF cameras commonly serve on, in the order they are tried (5000: Tuya OEM cameras). */
export const DEFAULT_ONVIF_PORTS: readonly number[] = [8000, 80, 5000, 8899, 2020, 6688, 8080];

export interface FindOnvifPortOptions {
  ports?: readonly number[];
  /** Per-call timeout. Default 3000 ms. */
  timeoutMs?: number;
  now?: () => Date;
}

export interface OnvifPort {
  port: number;
  /**
   * Camera clock minus ours, for WS-Security `Created`: 0 when the camera reports no UTC time, and
   * undefined when it wants a login even for GetSystemDateAndTime (the caller may ask again with one).
   */
  clockOffsetMs?: number;
}

/**
 * The first port whose device service answers GetSystemDateAndTime (unauthenticated, no credentials
 * sent), with the camera's clock offset. An authentication refusal (e.g. HTTP 401) also counts as
 * ONVIF answering there; only transport failures, timeouts and non-ONVIF replies mean "not here".
 * Rejects with OnvifUnreachableError when no port answers.
 */
export async function findOnvifPort(host: string, opts: FindOnvifPortOptions = {}): Promise<OnvifPort> {
  const now = opts.now ?? (() => new Date());
  for (const port of opts.ports ?? DEFAULT_ONVIF_PORTS) {
    let cameraTime: Date | undefined;
    try {
      cameraTime = await cameraUtcTime({ host, port, timeoutMs: opts.timeoutMs ?? 3000 });
    } catch (err) {
      if (err instanceof OnvifAuthError) return { port };
      continue;
    }
    return { port, clockOffsetMs: cameraTime ? cameraTime.getTime() - now().getTime() : 0 };
  }
  throw new OnvifUnreachableError(host);
}
