import type { RtspCredentials } from '../digest-auth/authorization.js';
import { sdpVideoCodec, type VideoCodec } from '../rtsp/sdp.js';
import { describeSwannPath, type SwannTarget } from './describe-path.js';
import { SwannNoStreamsError, SwannUnreachableError } from './errors.js';
import { SWANN_PATH_TEMPLATES, type SwannPathTemplate } from './paths.js';

export interface SwannChannel {
  channel: number;
  mainPath: string;
  subPath?: string;
  codec: VideoCodec;
}

export interface SwannProbeResult {
  /** The `name` of the SWANN_PATH_TEMPLATES entry that matched. */
  template: string;
  channels: SwannChannel[];
}

export interface SwannProbeOptions {
  /** RTSP port. Default 554. */
  port?: number;
  /** Per-DESCRIBE timeout. Default 3000 ms. */
  timeoutMs?: number;
  /** Answer a Basic-only challenge (cleartext password). Default false; the real recorder uses Digest. */
  allowBasic?: boolean;
}

const MAX_CHANNELS = 16;

/**
 * Finds the recorder's stream paths: channel 1 is tried with each template in order until one answers 200;
 * that template is then used for channels 2..16, stopping at the first channel whose main path fails.
 * Each found channel also gets its sub path when that answers 200, and the codec from the main stream's SDP.
 * Only channel 1 (the template search) raises SwannUnreachableError; past it, a transport failure means
 * "no more channels" / "no sub stream". SwannAuthError is raised wherever it happens.
 */
export async function probeSwann(host: string, creds: RtspCredentials, opts: SwannProbeOptions = {}): Promise<SwannProbeResult> {
  const target: SwannTarget = { host, creds, port: opts.port ?? 554, timeoutMs: opts.timeoutMs ?? 3000, allowBasic: opts.allowBasic ?? false };

  for (const template of SWANN_PATH_TEMPLATES) {
    const first = await describeSwannPath(target, template.mainPath(1));
    if (first === undefined) continue;
    const channels = [await toChannel(target, template, 1, first)];
    for (let ch = 2; ch <= MAX_CHANNELS; ch++) {
      const sdp = await describeOrNone(target, template.mainPath(ch));
      if (sdp === undefined) break;
      channels.push(await toChannel(target, template, ch, sdp));
    }
    return { template: template.name, channels };
  }
  throw new SwannNoStreamsError(host);
}

async function toChannel(target: SwannTarget, template: SwannPathTemplate, channel: number, mainSdp: string): Promise<SwannChannel> {
  const subPath = template.subPath(channel);
  const hasSub = (await describeOrNone(target, subPath)) !== undefined;
  return {
    channel,
    mainPath: template.mainPath(channel),
    ...(hasSub ? { subPath } : {}),
    codec: sdpVideoCodec(mainSdp) ?? 'OTHER',
  };
}

/** Like describeSwannPath, but a transport failure counts as "no stream here". Auth errors still propagate. */
async function describeOrNone(target: SwannTarget, path: string): Promise<string | undefined> {
  try {
    return await describeSwannPath(target, path);
  } catch (err) {
    if (err instanceof SwannUnreachableError) return undefined;
    throw err;
  }
}
