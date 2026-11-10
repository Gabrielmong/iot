import { describe, expect, it } from 'vitest';
import { frameKey, tuyaVectors, type TuyaVector } from '../test/tuya-vectors.js';
import { decodeFrames, encodeFrame, TuyaCmd, TuyaFrameError } from './frame.js';

const label = (v: TuyaVector) => `${v.version} ${v.kind}`;
const isDevice = (v: TuyaVector) => v.direction === 'device';

function encodeVector(v: TuyaVector): Buffer {
  return encodeFrame({
    version: v.version,
    key: frameKey(v),
    seq: v.seq,
    cmd: v.cmd,
    payload: Buffer.from(v.payloadHex, 'hex'),
    iv: v.ivHex ? Buffer.from(v.ivHex, 'hex') : undefined,
    retcode: isDevice(v) ? 0 : undefined,
  });
}

function decodeVector(v: TuyaVector, buf: Buffer = Buffer.from(v.frameHex, 'hex')) {
  return decodeFrames(buf, v.version, frameKey(v), { hasRetcode: isDevice(v) });
}

function byLabel(version: string, kind: string): TuyaVector {
  const v = tuyaVectors.find((x) => x.version === version && x.kind === kind);
  if (!v) throw new Error(`no vector ${version} ${kind}`);
  return v;
}

/** Flips one bit at `offsetFromEnd` bytes before the end of the frame. */
function corrupt(frameHex: string, offsetFromEnd: number): Buffer {
  const buf = Buffer.from(frameHex, 'hex');
  buf[buf.length - offsetFromEnd] ^= 0x01;
  return buf;
}

describe('encodeFrame', () => {
  it.each(tuyaVectors.map((v) => [label(v), v] as const))('matches the golden frame: %s', (_, v) => {
    expect(encodeVector(v).toString('hex')).toBe(v.frameHex);
  });

  it('uses a fresh random IV for 3.5 frames when none is given', () => {
    const v = byLabel('3.5', 'DP_QUERY');
    const opts = { version: v.version, key: frameKey(v), seq: 1, cmd: v.cmd, payload: Buffer.from(v.payloadHex, 'hex') };
    const a = encodeFrame(opts);
    const b = encodeFrame(opts);
    expect(a.equals(b)).toBe(false);
    expect(decodeFrames(a, '3.5', frameKey(v), { hasRetcode: false }).frames[0]?.payload.toString('hex')).toBe(v.payloadHex);
  });
});

describe('decodeFrames', () => {
  it.each(tuyaVectors.map((v) => [label(v), v] as const))('recovers the golden payload: %s', (_, v) => {
    const { frames, rest } = decodeVector(v);
    expect(rest.length).toBe(0);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      seq: v.seq,
      cmd: v.cmd,
      ...(isDevice(v) ? { retcode: 0 } : {}),
      payload: Buffer.from(v.payloadHex, 'hex'),
    });
  });

  it.each(['3.1', '3.3', '3.4', '3.5'])('splits two frames plus half a third (%s)', (version) => {
    const v = byLabel(version, 'CONTROL');
    const frame = Buffer.from(v.frameHex, 'hex');
    const half = frame.subarray(0, Math.floor(frame.length / 2));
    const { frames, rest } = decodeVector(v, Buffer.concat([frame, frame, half]));
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.payload.toString('hex'))).toEqual([v.payloadHex, v.payloadHex]);
    expect(rest.equals(half)).toBe(true);
  });

  it('returns everything as rest when even the header is incomplete', () => {
    const v = byLabel('3.5', 'CONTROL');
    const partial = Buffer.from(v.frameHex, 'hex').subarray(0, 10);
    const { frames, rest } = decodeVector(v, partial);
    expect(frames).toEqual([]);
    expect(rest.equals(partial)).toBe(true);
  });

  it('decodes an empty-payload device ack', () => {
    const key = Buffer.from('0123456789abcdef');
    const ack = encodeFrame({ version: '3.3', key, seq: 7, cmd: TuyaCmd.CONTROL, payload: Buffer.alloc(0), retcode: 0 });
    expect(decodeFrames(ack, '3.3', key).frames).toEqual([{ seq: 7, cmd: TuyaCmd.CONTROL, retcode: 0, payload: Buffer.alloc(0) }]);
  });

  it.each([
    ['3.3 CRC', byLabel('3.3', 'CONTROL'), 8],
    ['3.1 CRC', byLabel('3.1', 'DP_QUERY'), 8],
    ['3.4 HMAC', byLabel('3.4', 'CONTROL'), 10],
    ['3.5 GCM tag', byLabel('3.5', 'CONTROL'), 10],
  ] as const)('rejects a corrupted %s', (_, v, offset) => {
    expect(() => decodeVector(v, corrupt(v.frameHex, offset))).toThrow(TuyaFrameError);
  });

  it('rejects a 3.1 CONTROL frame with a bad md5 signature', () => {
    const v = byLabel('3.1', 'CONTROL');
    const key = frameKey(v);
    // The signed body ("3.1" + md5 + base64), one signature character changed, re-framed with a valid CRC.
    // DP_QUERY is sent in clear on 3.1, so encodeFrame wraps the tampered body as-is.
    const body = Buffer.from(Buffer.from(v.frameHex, 'hex').subarray(16, -8));
    body[4] = body[4] === 0x30 ? 0x31 : 0x30;
    const tampered = encodeFrame({ version: '3.1', key, seq: 1, cmd: TuyaCmd.DP_QUERY, payload: body });
    expect(() => decodeFrames(tampered, '3.1', key, { hasRetcode: false })).toThrow(TuyaFrameError);
  });

  it('rejects an unknown prefix', () => {
    expect(() => decodeFrames(Buffer.alloc(32, 0xff), '3.3', Buffer.alloc(16))).toThrow(TuyaFrameError);
  });
});

describe('decodeFrames verifyCrc option', () => {
  it('skips only the 55AA CRC check when verifyCrc is false', () => {
    const v = byLabel('3.3', 'CONTROL');
    const bad = corrupt(v.frameHex, 8);
    expect(() => decodeVector(v, bad)).toThrow(TuyaFrameError);
    const { frames } = decodeFrames(bad, '3.3', frameKey(v), { hasRetcode: false, verifyCrc: false });
    expect(frames[0]?.payload.toString('hex')).toBe(v.payloadHex);
  });

  it('still verifies the 3.4 HMAC when verifyCrc is false', () => {
    const v = byLabel('3.4', 'CONTROL');
    expect(() => decodeFrames(corrupt(v.frameHex, 10), '3.4', frameKey(v), { hasRetcode: false, verifyCrc: false })).toThrow(TuyaFrameError);
  });
});
