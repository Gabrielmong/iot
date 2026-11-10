import { addVersionHeader, stripVersionHeader } from './version-header.js';
import { RETCODE_LEN } from './wire.js';

/** 3.5 GCM plaintext: optional retcode, then the version header (unless the command omits it), then the payload. */
export function encodePlaintext35(cmd: number, payload: Buffer, retcode?: number): Buffer {
  const body = addVersionHeader('3.5', cmd, payload);
  if (retcode === undefined) return body;
  const rc = Buffer.alloc(RETCODE_LEN);
  rc.writeUInt32BE(retcode);
  return Buffer.concat([rc, body]);
}

/** Inverse of {@link encodePlaintext35}. */
export function decodePlaintext35(plaintext: Buffer, hasRetcode: boolean): { retcode?: number; payload: Buffer } {
  if (!hasRetcode) return { payload: stripVersionHeader('3.5', plaintext) };
  if (plaintext.length < RETCODE_LEN) throw new RangeError('3.5 plaintext shorter than its retcode');
  return {
    retcode: plaintext.readUInt32BE(0),
    payload: stripVersionHeader('3.5', plaintext.subarray(RETCODE_LEN)),
  };
}
