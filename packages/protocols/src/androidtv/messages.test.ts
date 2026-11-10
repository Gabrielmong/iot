import { describe, expect, it } from 'vitest';
import { FrameReader, decodeRemote, encodeRemote } from './messages.js';

describe('Android TV remote framing', () => {
  it('round-trips a RemoteKeyInject through varint length-prefixed framing', () => {
    const frame = encodeRemote({ remoteKeyInject: { keyCode: 24, direction: 3 } });
    expect(frame[0]).toBe(frame.length - 1); // one-byte varint length prefix
    const frames = new FrameReader().push(frame);
    expect(frames).toHaveLength(1);
    expect(decodeRemote(frames[0]).remoteKeyInject).toEqual({ keyCode: 24, direction: 3 });
  });

  it('rejects a frame declaring more than 64 KiB, before buffering it', () => {
    const header = Buffer.from([0x81, 0x80, 0x04]); // varint 65537
    expect(() => new FrameReader().push(header)).toThrow('Frame too large');
  });

  it('splits several frames in one chunk and joins a frame split across chunks', () => {
    const a = encodeRemote({ remotePingRequest: { val1: 7 } });
    const b = encodeRemote({ remoteAppLinkLaunchRequest: { appLink: 'x'.repeat(200) } }); // 2-byte varint
    const reader = new FrameReader();
    const all = Buffer.concat([a, b]);
    expect(reader.push(all.subarray(0, a.length + 3))).toHaveLength(1);
    const rest = reader.push(all.subarray(a.length + 3));
    expect(rest).toHaveLength(1);
    expect(decodeRemote(rest[0]).remoteAppLinkLaunchRequest?.appLink).toBe('x'.repeat(200));
  });
});
