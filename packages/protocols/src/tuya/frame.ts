import { randomBytes } from 'node:crypto';
import type { TuyaVersion } from '../types.js';
import { decodeBody, encodeBody } from './body-codec.js';
import { pack55AA, unpack55AA } from './envelope-55aa.js';
import { pack6699, unpack6699 } from './envelope-6699.js';
import { TuyaDecryptError, TuyaFrameError } from './errors.js';
import { frameLength } from './frame-length.js';
import { decodePlaintext35, encodePlaintext35 } from './plaintext-35.js';
import { GCM_IV_LEN, PREFIX_55AA, PREFIX_6699 } from './wire.js';

export { TuyaCmd } from './constants.js';
export { TuyaDecryptError, TuyaFrameError } from './errors.js';

export interface EncodeFrameOptions {
  version: TuyaVersion;
  /** Local key, or the negotiated session key for 3.4/3.5 data frames. */
  key: Buffer;
  seq: number;
  cmd: number;
  payload: Buffer;
  /** 3.5 only: GCM IV. Random by default; fixed only in tests. */
  iv?: Buffer;
  /** Retcode, present only on device-to-client frames. */
  retcode?: number;
}

export interface DecodeFramesOptions {
  /** Whether frames carry a 4-byte retcode. Device-to-client frames do (the default). */
  hasRetcode?: boolean;
  /**
   * Whether to verify the CRC32 of 55AA frames that have no HMAC (default true). Only UDP discovery
   * turns it off, as tinytuya does; HMAC and GCM tags are always verified.
   */
  verifyCrc?: boolean;
}

export interface TuyaFrame {
  seq: number;
  cmd: number;
  retcode?: number;
  payload: Buffer;
}

/** Encrypts, signs and frames one message per tinytuya's `_encode_message`/`pack_message`. */
export function encodeFrame(opts: EncodeFrameOptions): Buffer {
  const { version, key, seq, cmd, payload, retcode } = opts;
  if (version === '3.5') {
    const plaintext = encodePlaintext35(cmd, payload, retcode);
    return pack6699({ seq, cmd, plaintext }, key, opts.iv ?? randomBytes(GCM_IV_LEN));
  }
  const body = encodeBody(version, key, cmd, payload);
  return pack55AA({ seq, cmd, retcode, body }, version === '3.4' ? key : undefined);
}

/**
 * Decodes every complete frame at the start of `buf` (one TCP chunk plus any earlier `rest`).
 * Incomplete trailing bytes are returned as `rest`. Throws {@link TuyaFrameError} on a bad frame.
 */
export function decodeFrames(
  buf: Buffer,
  version: TuyaVersion,
  key: Buffer,
  opts: DecodeFramesOptions = {},
): { frames: TuyaFrame[]; rest: Buffer } {
  const hasRetcode = opts.hasRetcode ?? true;
  const verifyCrc = opts.verifyCrc ?? true;
  const frames: TuyaFrame[] = [];
  let offset = 0;
  for (;;) {
    const remaining = buf.subarray(offset);
    const length = frameLength(remaining);
    if (length === undefined || remaining.length < length) return { frames, rest: remaining };
    frames.push(decodeFrame(remaining.subarray(0, length), version, key, hasRetcode, verifyCrc));
    offset += length;
  }
}

function decodeFrame(frame: Buffer, version: TuyaVersion, key: Buffer, hasRetcode: boolean, verifyCrc: boolean): TuyaFrame {
  const expectedPrefix = version === '3.5' ? PREFIX_6699 : PREFIX_55AA;
  if (frame.readUInt32BE(0) !== expectedPrefix) throw new TuyaFrameError(`wrong frame prefix for version ${version}`);
  try {
    if (version === '3.5') {
      const { seq, cmd, plaintext } = unpack6699(frame, key);
      return { seq, cmd, ...decodePlaintext35(plaintext, hasRetcode) };
    }
    const { body, ...envelope } = unpack55AA(frame, hasRetcode, version === '3.4' ? key : undefined, verifyCrc);
    return { ...envelope, payload: decodeBody(version, key, body) };
  } catch (cause) {
    if (cause instanceof TuyaFrameError) throw cause;
    throw new TuyaDecryptError('undecodable frame payload', { cause });
  }
}
