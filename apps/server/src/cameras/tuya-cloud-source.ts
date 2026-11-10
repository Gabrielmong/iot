import { allocateCloudSource, type StreamAllocator } from "./cloud-allocation.js";
import { failureReason } from "./failure-reason.js";
import { CameraUnavailableError } from "./streams/errors.js";
import type { StreamResolver } from "./streams/types.js";

/** After a refused allocation, the cloud is not asked again for that camera for this long. */
export const REFUSAL_BACKOFF_MS = 60_000;

export interface TuyaCloudSourceOptions {
  allocate: StreamAllocator;
  /** Whether go2rtc is producing the camera's stream now (connected and receiving). */
  hasActiveProducer: (deviceId: string) => Promise<boolean>;
  /** Never given a URL or a stream name: only device ids and sanitized reasons. */
  log: Pick<Console, "info" | "warn">;
}

/**
 * Streams for Tuya cameras set to CLOUD (the labelled exception to LAN-only). Tuya's stream URLs are
 * short-lived or single-use (a reused one is refused with 404), so a fresh URL is allocated whenever
 * go2rtc must start a producer: `resolve` runs before every consumer-starting action (thumbnail miss,
 * WebRTC signalling, MSE open). While a producer is active the current source is kept, and the new
 * consumer joins it. A refusal is remembered for 60 s, so polling cannot hammer the cloud. URLs are
 * bearer secrets: they go to go2rtc only, never to logs or errors.
 */
export class TuyaCloudSource {
  private readonly current = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly refused = new Map<string, { until: number; error: unknown }>();

  constructor(private readonly opts: TuyaCloudSourceOptions) {}

  readonly resolve: StreamResolver = async (device) => {
    if (device.brand !== "TUYA") throw new CameraUnavailableError(`no cloud streams for ${device.brand} devices`);
    const src = this.current.get(device.id);
    if (src && (await this.producing(device.id))) return { live: src };
    const refusal = this.refused.get(device.id);
    if (refusal && Date.now() < refusal.until) throw refusal.error;
    return { live: await this.allocateShared(device.id, device.externalId) };
  };

  dispose(): void {
    this.current.clear();
    this.refused.clear();
  }

  private producing(deviceId: string): Promise<boolean> {
    return this.opts.hasActiveProducer(deviceId).catch(() => false);
  }

  /** One allocation at a time per camera; concurrent starts share it, and its failure is logged once. */
  private allocateShared(deviceId: string, tuyaId: string): Promise<string> {
    const running = this.pending.get(deviceId);
    if (running) return running;
    const started = allocateCloudSource(this.opts.allocate, tuyaId)
      .then(
        (src) => {
          this.refused.delete(deviceId);
          this.current.set(deviceId, src);
          this.opts.log.info(`streams: allocated a cloud stream for camera ${deviceId}`);
          return src;
        },
        (err: unknown) => {
          this.refused.set(deviceId, { until: Date.now() + REFUSAL_BACKOFF_MS, error: err });
          this.opts.log.warn(`streams: no cloud stream for camera ${deviceId} (${failureReason(err)})`);
          throw err;
        },
      )
      .finally(() => this.pending.delete(deviceId));
    this.pending.set(deviceId, started);
    return started;
  }
}
