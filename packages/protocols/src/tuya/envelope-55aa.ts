import { createHmac, timingSafeEqual } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { TuyaDecryptError, TuyaFrameError } from './errors.js';
import { CRC_LEN, HEADER_55AA_LEN, HMAC_LEN, PREFIX_55AA, RETCODE_LEN, SUFFIX_55AA, SUFFIX_LEN } from './wire.js';

export interface Envelope55AA {
  seq: number;
  cmd: number;
  retcode?: number;
  body: Buffer;
}

/** Builds a 55AA frame: header, optional retcode, body, CRC32 (or HMAC-SHA256 with `hmacKey`), suffix. */
export function pack55AA(env: Envelope55AA, hmacKey?: Buffer): Buffer {
  const retcode = env.retcode === undefined ? Buffer.alloc(0) : u32(env.retcode);
  const header = Buffer.alloc(HEADER_55AA_LEN);
  header.writeUInt32BE(PREFIX_55AA, 0);
  header.writeUInt32BE(env.seq, 4);
  header.writeUInt32BE(env.cmd, 8);
  header.writeUInt32BE(retcode.length + env.body.length + trailerLen(hmacKey) + SUFFIX_LEN, 12);
  const signed = Buffer.concat([header, retcode, env.body]);
  return Buffer.concat([signed, trailer(signed, hmacKey), u32(SUFFIX_55AA)]);
}

/** Parses one complete 55AA frame and verifies its HMAC, and its CRC32 unless `verifyCrc` is false. */
export function unpack55AA(frame: Buffer, hasRetcode: boolean, hmacKey?: Buffer, verifyCrc = true): Envelope55AA {
  const retcodeLen = hasRetcode ? RETCODE_LEN : 0;
  const trailerStart = frame.length - SUFFIX_LEN - trailerLen(hmacKey);
  if (trailerStart < HEADER_55AA_LEN + retcodeLen) throw new TuyaFrameError('55AA frame too short');
  if (frame.readUInt32BE(frame.length - SUFFIX_LEN) !== SUFFIX_55AA) throw new TuyaFrameError('bad 55AA suffix');

  const expected = trailer(frame.subarray(0, trailerStart), hmacKey);
  if ((hmacKey || verifyCrc) && !timingSafeEqual(expected, frame.subarray(trailerStart, frame.length - SUFFIX_LEN))) {
    // An HMAC is keyed, so its failure points at the key; a CRC failure is plain corruption.
    if (hmacKey) throw new TuyaDecryptError('55AA HMAC mismatch');
    throw new TuyaFrameError('55AA CRC mismatch');
  }
  return {
    seq: frame.readUInt32BE(4),
    cmd: frame.readUInt32BE(8),
    ...(hasRetcode ? { retcode: frame.readUInt32BE(HEADER_55AA_LEN) } : {}),
    body: frame.subarray(HEADER_55AA_LEN + retcodeLen, trailerStart),
  };
}

function trailerLen(hmacKey: Buffer | undefined): number {
  return hmacKey ? HMAC_LEN : CRC_LEN;
}

function trailer(data: Buffer, hmacKey: Buffer | undefined): Buffer {
  return hmacKey ? createHmac('sha256', hmacKey).update(data).digest() : u32(crc32(data));
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
