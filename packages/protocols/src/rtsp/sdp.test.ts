import { describe, expect, it } from 'vitest';
import { sdpWithVideo } from '../test/fake-rtsp-server.js';
import { sdpVideoCodec } from './sdp.js';

describe('sdpVideoCodec', () => {
  it('reads H264 and H265 from the video rtpmap', () => {
    expect(sdpVideoCodec(sdpWithVideo('H264'))).toBe('H264');
    expect(sdpVideoCodec(sdpWithVideo('H265'))).toBe('H265');
  });

  it('treats HEVC as H265 and is case-insensitive', () => {
    expect(sdpVideoCodec('m=video 0 RTP/AVP 98\na=rtpmap:98 hevc/90000\n')).toBe('H265');
  });

  it('uses the rtpmap of the video payload type, not an audio one', () => {
    const sdp = 'v=0\r\nm=audio 0 RTP/AVP 97\r\na=rtpmap:97 H264/8000\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 JPEG/90000\r\n';
    expect(sdpVideoCodec(sdp)).toBe('OTHER');
  });

  it('is OTHER for a video track without a known rtpmap, undefined without video', () => {
    expect(sdpVideoCodec('m=video 0 RTP/AVP 26\r\n')).toBe('OTHER');
    expect(sdpVideoCodec('v=0\r\nm=audio 0 RTP/AVP 8\r\n')).toBeUndefined();
  });
});
