export type VideoCodec = 'H264' | 'H265' | 'OTHER';

/**
 * The codec of the first video track in an SDP, from the `a=rtpmap` of its first payload type.
 * `OTHER` for any other or unmapped encoding; undefined when there is no video track.
 */
export function sdpVideoCodec(sdp: string): VideoCodec | undefined {
  const lines = sdp.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('m=video '));
  if (start < 0) return undefined;
  const payloadType = lines[start]!.trim().split(/\s+/)[3];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('m=')) break;
    const match = /^a=rtpmap:(\d+)\s+([^/\s]+)/.exec(line);
    if (match && match[1] === payloadType) return codecOf(match[2]!);
  }
  return 'OTHER';
}

function codecOf(encoding: string): VideoCodec {
  const name = encoding.toUpperCase();
  if (name === 'H264') return 'H264';
  if (name === 'H265' || name === 'HEVC') return 'H265';
  return 'OTHER';
}
