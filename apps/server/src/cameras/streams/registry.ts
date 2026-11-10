import type { DeviceRecord } from "../../devices/types.js";
import type { Go2rtcApi } from "../go2rtc/api.js";
import type { Go2rtcStream, StreamSource } from "../go2rtc/reregister.js";
import { CameraUnavailableError } from "./errors.js";
import { aliasesStream } from "./source-url.js";
import { StreamNames } from "./stream-names.js";
import type { CameraSources, CameraStreams, StreamResolver } from "./types.js";

export interface StreamRegistryOptions {
  api: Pick<Go2rtcApi, "putStream" | "deleteStream">;
  resolve: StreamResolver;
  /** Whether go2rtc is up; nothing is sent to it otherwise. */
  isReady: () => boolean;
  log: Pick<Console, "info" | "warn">;
}

/**
 * The cameras' go2rtc streams. Sources (with the login) are built by the resolvers, kept in memory and
 * sent only to go2rtc. Streams are named here, with unguessable per-run names (StreamNames); callers
 * get them only to talk to go2rtc, and logs name the device id instead.
 */
export class StreamRegistry implements StreamSource {
  private readonly byDevice = new Map<string, CameraStreams>();
  private readonly names = new StreamNames();

  constructor(private readonly opts: StreamRegistryOptions) {}

  /** Registers (or refreshes) the device's streams. Throws CameraUnavailableError when that cannot be done now. */
  async ensure(device: DeviceRecord): Promise<{ live: string; thumb: string }> {
    if (!this.opts.isReady()) throw new CameraUnavailableError("camera streaming is not available");
    const streams = this.named(device.id, await this.opts.resolve(device));
    const list = streamList(streams);
    const others = [...this.streams()].map((s) => s.name).concat(list.map((s) => s.name));
    if (list.some((s) => aliasesStream(s.src, others))) throw new CameraUnavailableError("camera stream path is not usable");

    for (const s of list) {
      try {
        await this.opts.api.putStream(s.name, s.src);
      } catch {
        this.opts.log.warn(`streams: could not register a stream of camera ${device.id}`);
        throw new CameraUnavailableError("camera streaming is not available");
      }
    }
    this.byDevice.set(device.id, streams);
    this.opts.log.info(`streams: registered ${list.length} stream(s) for camera ${device.id}`);
    return { live: streams.live.name, thumb: (streams.sub ?? streams.live).name };
  }

  /** Forgets the device's streams and removes them from go2rtc (best effort). Its names stay for the run. */
  async release(deviceId: string): Promise<void> {
    const streams = this.byDevice.get(deviceId);
    if (!streams) return;
    this.byDevice.delete(deviceId);
    if (!this.opts.isReady()) return;
    for (const { name } of streamList(streams)) {
      await this.opts.api.deleteStream(name).catch(() => this.opts.log.warn(`streams: could not remove a stream of camera ${deviceId}`));
    }
  }

  /** Ids of the devices whose streams are registered now. */
  deviceIds(): string[] {
    return [...this.byDevice.keys()];
  }

  /** The go2rtc names the device's streams have this run (live, then sub); none if it never had any. */
  streamNamesOf(deviceId: string): string[] {
    return this.names.known(deviceId);
  }

  /** Sends every known stream to go2rtc again (its streams live in memory only). */
  async reregisterAll(): Promise<void> {
    if (!this.opts.isReady()) return;
    for (const [deviceId, streams] of this.byDevice) {
      for (const { name, src } of streamList(streams)) {
        await this.opts.api.putStream(name, src).catch(() => this.opts.log.warn(`streams: could not register a stream of camera ${deviceId}`));
      }
    }
  }

  *streams(): Iterable<Go2rtcStream> {
    for (const streams of this.byDevice.values()) yield* streamList(streams);
  }

  private named(deviceId: string, sources: CameraSources): CameraStreams {
    const names = this.names.of(deviceId);
    return {
      live: { name: names.live, src: sources.live },
      ...(sources.sub ? { sub: { name: names.sub, src: sources.sub } } : {}),
    };
  }
}

function streamList(streams: CameraStreams): Go2rtcStream[] {
  return streams.sub ? [streams.live, streams.sub] : [streams.live];
}
