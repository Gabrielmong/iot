import { gcmDecrypt, gcmEncrypt } from './aes.js';
import { TuyaDecryptError, TuyaFrameError } from './errors.js';
import { GCM_IV_LEN, GCM_TAG_LEN, HEADER_6699_LEN, PREFIX_6699, SUFFIX_6699, SUFFIX_LEN } from './wire.js';

export interface Envelope6699 {
  seq: number;
  cmd: number;
  /** GCM plaintext, including any retcode and version header. */
  plaintext: Buffer;
}

/** The header bytes after the prefix are the GCM additional authenticated data. */
const AAD_START = 4;

/** Builds a 6699 frame: header, IV, AES-128-GCM ciphertext, tag, suffix. */
export function pack6699(env: Envelope6699, key: Buffer, iv: Buffer): Buffer {
  if (iv.length !== GCM_IV_LEN) throw new RangeError(`GCM IV must be ${GCM_IV_LEN} bytes`);
  const header = Buffer.alloc(HEADER_6699_LEN);
  header.writeUInt32BE(PREFIX_6699, 0);
  header.writeUInt16BE(0, 4);
  header.writeUInt32BE(env.seq, 6);
  header.writeUInt32BE(env.cmd, 10);
  header.writeUInt32BE(GCM_IV_LEN + env.plaintext.length + GCM_TAG_LEN, 14);
  const { ciphertext, tag } = gcmEncrypt(key, iv, env.plaintext, header.subarray(AAD_START));
  const suffix = Buffer.alloc(SUFFIX_LEN);
  suffix.writeUInt32BE(SUFFIX_6699);
  return Buffer.concat([header, iv, ciphertext, tag, suffix]);
}

/** Parses one complete 6699 frame and authenticates/decrypts it. */
export function unpack6699(frame: Buffer, key: Buffer): Envelope6699 {
  const ivEnd = HEADER_6699_LEN + GCM_IV_LEN;
  const tagStart = frame.length - SUFFIX_LEN - GCM_TAG_LEN;
  if (tagStart < ivEnd) throw new TuyaFrameError('6699 frame too short');
  if (frame.readUInt32BE(frame.length - SUFFIX_LEN) !== SUFFIX_6699) throw new TuyaFrameError('bad 6699 suffix');

  let plaintext: Buffer;
  try {
    plaintext = gcmDecrypt(
      key,
      frame.subarray(HEADER_6699_LEN, ivEnd),
      frame.subarray(ivEnd, tagStart),
      frame.subarray(tagStart, tagStart + GCM_TAG_LEN),
      frame.subarray(AAD_START, HEADER_6699_LEN),
    );
  } catch (cause) {
    throw new TuyaDecryptError('6699 GCM authentication failed', { cause });
  }
  return { seq: frame.readUInt32BE(6), cmd: frame.readUInt32BE(10), plaintext };
}
