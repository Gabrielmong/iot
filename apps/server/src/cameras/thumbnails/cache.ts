/** How long one grabbed frame is served before the next request grabs a new one. */
export const THUMBNAIL_MAX_AGE_MS = 10_000;

export interface Frame {
  jpeg: Buffer;
  /** When it was grabbed (ms since epoch, on the cache's clock). */
  grabbedAt: number;
}

/**
 * One JPEG per camera, kept for at most THUMBNAIL_MAX_AGE_MS. Concurrent misses share one grab, and a
 * failed grab is never cached. Only cameras someone asked for have entries; `evict` drops one.
 */
export class ThumbnailCache {
  private readonly frames = new Map<string, Frame>();
  private readonly grabs = new Map<string, Promise<Frame>>();

  constructor(
    private readonly now: () => number,
    private readonly maxAgeMs = THUMBNAIL_MAX_AGE_MS,
  ) {}

  /** The cached frame if fresh, else the result of `grab` (shared with any grab already running). */
  get(deviceId: string, grab: () => Promise<Buffer>): Promise<Frame> {
    const cached = this.frames.get(deviceId);
    if (cached && this.now() - cached.grabbedAt < this.maxAgeMs) return Promise.resolve(cached);
    return this.grabs.get(deviceId) ?? this.start(deviceId, grab);
  }

  /** Age of a frame in whole seconds. */
  ageSeconds(frame: Frame): number {
    return Math.max(0, Math.floor((this.now() - frame.grabbedAt) / 1000));
  }

  evict(deviceId: string): void {
    this.frames.delete(deviceId);
    this.grabs.delete(deviceId);
  }

  private start(deviceId: string, grab: () => Promise<Buffer>): Promise<Frame> {
    const running = grab().then(
      (jpeg) => {
        const frame = { jpeg, grabbedAt: this.now() };
        // Only the grab still current stores its frame: an evict while grabbing discards it.
        if (this.grabs.get(deviceId) === running) this.frames.set(deviceId, frame);
        return frame;
      },
    ).finally(() => {
      if (this.grabs.get(deviceId) === running) this.grabs.delete(deviceId);
    });
    this.grabs.set(deviceId, running);
    return running;
  }
}
