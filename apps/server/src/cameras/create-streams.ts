import { rtspDescribe, TuyaCloud } from "@home/protocols";
import type { PrismaClient } from "../generated/prisma/client.js";
import { onvifCredentialsFrom } from "../devices/onvif-credentials.js";
import { swannSettingsFrom } from "../devices/swann-settings.js";
import { tuyaCloudCredentials } from "../services/integrations.js";
import type { Go2rtcApi } from "./go2rtc/api.js";
import { onvifStreamResolver } from "./streams/onvif-streams.js";
import { DigestGuard } from "./streams/digest-guard.js";
import { StreamRegistry } from "./streams/registry.js";
import { resolveByBrand } from "./streams/resolve-by-brand.js";
import { resolveBySource } from "./streams/resolve-by-source.js";
import { swannStreamResolver } from "./streams/swann-streams.js";
import { TuyaCloudSource } from "./tuya-cloud-source.js";
import { tuyaStreamAllocator } from "./tuya-stream-allocator.js";

export interface CameraStreamsOptions {
  prisma: PrismaClient;
  secretKey: Buffer;
  api: Go2rtcApi;
  isReady: () => boolean;
  log: Pick<Console, "info" | "warn">;
}

const DIGEST_CHECK_TIMEOUT_MS = 2000;

/**
 * The stream registry with its sources: LOCAL cameras from the Swann recorder or (Tuya) over ONVIF,
 * CLOUD ones from the Tuya cloud.
 */
export function createCameraStreams(opts: CameraStreamsOptions): { streams: StreamRegistry; cloud: TuyaCloudSource } {
  const cloud = new TuyaCloudSource({
    allocate: tuyaStreamAllocator(() => tuyaCloudCredentials(opts), (creds) => new TuyaCloud(creds)),
    hasActiveProducer: async (deviceId) => {
      const [live] = streams.streamNamesOf(deviceId);
      return live ? ((await opts.api.streamInfo(live))?.producers.some((p) => p.active) ?? false) : false;
    },
    log: opts.log,
  });
  // Digest only (allowBasic stays false), with a short timeout: it runs before registering a local stream.
  const guard = new DigestGuard({ describe: (url, creds) => rtspDescribe(url, creds, DIGEST_CHECK_TIMEOUT_MS), log: opts.log });
  const streams = new StreamRegistry({
    api: opts.api,
    resolve: resolveBySource({
      LOCAL: resolveByBrand({
        SWANN: swannStreamResolver(swannSettingsFrom(opts.prisma, opts.secretKey), guard),
        TUYA: onvifStreamResolver(onvifCredentialsFrom(opts.prisma, opts.secretKey), guard),
      }),
      CLOUD: cloud.resolve,
    }),
    isReady: opts.isReady,
    log: opts.log,
  });
  return { streams, cloud };
}
