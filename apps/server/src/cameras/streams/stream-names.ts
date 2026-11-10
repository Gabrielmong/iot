import { randomBytes } from "node:crypto";

/** A camera's go2rtc stream names. */
export type StreamNamePair = { live: string; sub: string };

/**
 * go2rtc stream names: `cam-<random>` / `cam-<random>-sub`, with 128 random bits per device per run,
 * kept in memory only. go2rtc's RTSP server (loopback, but auth-exempt for loopback clients) serves
 * any stream by name, so names must be unguessable, not derived from device ids. Owned by the stream
 * registry: nothing else computes names. Names are never logged nor sent to the browser.
 */
export class StreamNames {
  private readonly byDevice = new Map<string, StreamNamePair>();

  constructor(private readonly random: () => string = () => randomBytes(16).toString("hex")) {}

  /** The device's names for this run, chosen on first use. */
  of(deviceId: string): StreamNamePair {
    let names = this.byDevice.get(deviceId);
    if (!names) {
      const id = this.random();
      names = { live: `cam-${id}`, sub: `cam-${id}-sub` };
      this.byDevice.set(deviceId, names);
    }
    return names;
  }

  /** The device's names if it has any this run, else none (never chooses new ones). */
  known(deviceId: string): string[] {
    const names = this.byDevice.get(deviceId);
    return names ? [names.live, names.sub] : [];
  }
}
