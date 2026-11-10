import type { RtspCredentials } from '../digest-auth/authorization.js';
import { cameraUtcTime } from './device-service.js';
import { findOnvifPort } from './find-port.js';
import { onvifStreamUris, type OnvifStreamUris } from './media.js';

export interface OnvifProbeOptions {
  /** Ports to try, in order. Default DEFAULT_ONVIF_PORTS. */
  ports?: readonly number[];
  /** Per-call timeout. Default 3000 ms. */
  timeoutMs?: number;
  now?: () => Date;
}

/** The ONVIF port that answered, and the stream URIs found there. */
export type OnvifProbeResult = OnvifStreamUris & { port: number };

/**
 * Finds the camera's ONVIF port (unauthenticated GetSystemDateAndTime, which also gives its clock),
 * then its stream URIs with a PasswordDigest (and, if challenged, HTTP Digest) login on that clock.
 * A camera that wants a login for the time call is asked again with one; if that fails too, our own
 * clock is used. Errors as onvifStreamUris.
 */
export async function probeOnvif(host: string, creds: RtspCredentials, opts: OnvifProbeOptions = {}): Promise<OnvifProbeResult> {
  const now = opts.now ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? 3000;
  const found = await findOnvifPort(host, { ports: opts.ports, timeoutMs, now });
  const clockOffsetMs = found.clockOffsetMs ?? (await authenticatedOffset(host, found.port, creds, timeoutMs, now));
  return { port: found.port, ...(await onvifStreamUris(host, found.port, creds, { timeoutMs, clockOffsetMs, now })) };
}

/** The clock offset from an authenticated GetSystemDateAndTime; 0 (our clock) when that fails. */
async function authenticatedOffset(host: string, port: number, creds: RtspCredentials, timeoutMs: number, now: () => Date): Promise<number> {
  try {
    const cameraTime = await cameraUtcTime({ host, port, timeoutMs }, { creds, clockOffsetMs: 0, now });
    return cameraTime ? cameraTime.getTime() - now().getTime() : 0;
  } catch {
    return 0;
  }
}
