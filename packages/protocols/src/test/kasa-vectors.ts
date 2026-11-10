import { readFileSync } from 'node:fs';

export interface KasaVector {
  variant: 'v1' | 'v2';
  username: string;
  password: string;
  localSeedHex: string;
  remoteSeedHex: string;
  authHashHex: string;
  handshake1ResponseHex: string;
  handshake2Hex: string;
  keyHex: string;
  ivHex: string;
  initialSeq: number;
  seq: number;
  sigHex: string;
  plaintext: string;
  requestBodyHex: string;
  responsePlaintext: string;
  responseBodyHex: string;
}

export const kasaVectors: KasaVector[] = JSON.parse(
  readFileSync(new URL('./fixtures/kasa-vectors.json', import.meta.url), 'utf8'),
);

export const hex = (s: string): Buffer => Buffer.from(s, 'hex');
