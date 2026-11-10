import type { RtspCredentials } from '../digest-auth/authorization.js';
import type { VideoCodec } from '../rtsp/sdp.js';
import { onvifCall, type OnvifAuth, type OnvifTarget } from './call.js';
import { mediaServicePath } from './device-service.js';
import { OnvifFaultError, OnvifNoStreamError } from './errors.js';
import { escapeXml, xmlElements, xmlText } from './xml.js';

export interface OnvifStreamUris {
  /** The first profile's RTSP URI, as the camera reported it (may carry userinfo or another host). */
  main: string;
  /** The second profile's, when there is one. */
  sub?: string;
  /** The first profile's video encoding, when reported. */
  codec?: VideoCodec;
}

export interface OnvifStreamUrisOptions {
  /** Per-call timeout. Default 3000 ms. */
  timeoutMs?: number;
  /** Camera clock minus ours (from findOnvifPort). Default 0. */
  clockOffsetMs?: number;
  now?: () => Date;
}

const MEDIA_NS = 'http://www.onvif.org/ver10/media/wsdl';
const SCHEMA_NS = 'http://www.onvif.org/ver10/schema';

/**
 * The RTSP URIs of the camera's first two media profiles: GetCapabilities for the media service path,
 * GetProfiles, then GetStreamUri (RTP-Unicast over RTSP) per profile, all with a PasswordDigest login.
 * Rejects with OnvifAuthError, OnvifUnreachableError, or OnvifNoStreamError (no profiles, or the
 * media calls fault). Error messages never contain the password or a URI.
 */
export async function onvifStreamUris(host: string, port: number, creds: RtspCredentials, opts: OnvifStreamUrisOptions = {}): Promise<OnvifStreamUris> {
  const target: OnvifTarget = { host, port, timeoutMs: opts.timeoutMs ?? 3000 };
  const auth: OnvifAuth = { creds, clockOffsetMs: opts.clockOffsetMs ?? 0, now: opts.now ?? (() => new Date()) };
  const path = await mediaServicePath(target, auth);
  try {
    const profiles = await getProfiles(target, path, auth);
    if (profiles.length === 0) throw new OnvifNoStreamError(host);
    const [main, sub] = profiles.slice(0, 2);
    const mainUri = await getStreamUri(target, path, auth, main!.token);
    const subUri = sub && (await getStreamUri(target, path, auth, sub.token).catch(() => undefined));
    return { main: mainUri, ...(subUri ? { sub: subUri } : {}), ...(main!.codec ? { codec: main!.codec } : {}) };
  } catch (err) {
    if (err instanceof OnvifFaultError) throw new OnvifNoStreamError(host);
    throw err;
  }
}

type Profile = { token: string; codec?: VideoCodec };

async function getProfiles(target: OnvifTarget, path: string, auth: OnvifAuth): Promise<Profile[]> {
  const xml = await onvifCall(target, path, { action: `${MEDIA_NS}/GetProfiles`, body: `<trt:GetProfiles xmlns:trt="${MEDIA_NS}"/>` }, auth);
  return xmlElements(xml, 'Profiles').flatMap((p) => {
    const token = p.attrs.token;
    if (!token) return [];
    const encoder = xmlElements(p.inner, 'VideoEncoderConfiguration')[0];
    const codec = encoder && codecOf(xmlText(encoder.inner, 'Encoding'));
    return [{ token, ...(codec ? { codec } : {}) }];
  });
}

async function getStreamUri(target: OnvifTarget, path: string, auth: OnvifAuth, token: string): Promise<string> {
  const body =
    `<trt:GetStreamUri xmlns:trt="${MEDIA_NS}" xmlns:tt="${SCHEMA_NS}"><trt:StreamSetup>` +
    '<tt:Stream>RTP-Unicast</tt:Stream><tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup>' +
    `<trt:ProfileToken>${escapeXml(token)}</trt:ProfileToken></trt:GetStreamUri>`;
  const xml = await onvifCall(target, path, { action: `${MEDIA_NS}/GetStreamUri`, body }, auth);
  const uri = xmlText(xml, 'Uri');
  if (!uri?.toLowerCase().startsWith('rtsp://')) throw new OnvifNoStreamError(target.host);
  return uri;
}

function codecOf(encoding: string | undefined): VideoCodec | undefined {
  const name = encoding?.toUpperCase();
  if (name === 'H264') return 'H264';
  if (name === 'H265' || name === 'HEVC') return 'H265';
  return name ? 'OTHER' : undefined;
}
