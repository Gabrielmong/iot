import { TuyaFrameError } from './errors.js';
import { HEADER_55AA_LEN, HEADER_6699_LEN, MAX_DECLARED_LENGTH, PREFIX_55AA, PREFIX_6699, SUFFIX_LEN } from './wire.js';

/**
 * Total byte length of the frame at the start of `buf`, or `undefined` while its header is incomplete.
 * Throws on an unknown prefix or an implausible declared length.
 */
export function frameLength(buf: Buffer): number | undefined {
  if (buf.length < 4) return undefined;
  const prefix = buf.readUInt32BE(0);
  if (prefix === PREFIX_55AA) {
    if (buf.length < HEADER_55AA_LEN) return undefined;
    return HEADER_55AA_LEN + checked(buf.readUInt32BE(12));
  }
  if (prefix === PREFIX_6699) {
    if (buf.length < HEADER_6699_LEN) return undefined;
    return HEADER_6699_LEN + checked(buf.readUInt32BE(14)) + SUFFIX_LEN;
  }
  throw new TuyaFrameError(`unknown frame prefix 0x${prefix.toString(16).padStart(8, '0')}`);
}

function checked(declared: number): number {
  if (declared > MAX_DECLARED_LENGTH) {
    throw new TuyaFrameError(`declared frame length ${declared} exceeds ${MAX_DECLARED_LENGTH}`);
  }
  return declared;
}
