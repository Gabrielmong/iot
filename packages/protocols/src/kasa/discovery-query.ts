import { crc32 } from 'node:zlib';

const TDP_VERSION = 2;
const MSG_TYPE = 0;
const OP_PROBE = 1;
const FLAGS = 17;
const CRC_PLACEHOLDER = 0x5a6b7c8d;
const HEADER_LENGTH = 16;

/**
 * Builds python-kasa's `_AesDiscoveryQuery`: a 16-byte TDP header (version, type, op code, payload
 * size, flags, pad, random serial, crc32) followed by `{"params":{"rsa_key":"<PEM>"}}`. The crc is
 * computed over the whole packet with the placeholder 0x5A6B7C8D in the crc field.
 */
export function buildDiscoveryQuery(rsaPublicKeyPem: string, serial: Buffer): Buffer {
  const payload = Buffer.from(JSON.stringify({ params: { rsa_key: rsaPublicKeyPem } }), 'utf8');
  const query = Buffer.alloc(HEADER_LENGTH + payload.length);
  query.writeUInt8(TDP_VERSION, 0);
  query.writeUInt8(MSG_TYPE, 1);
  query.writeUInt16BE(OP_PROBE, 2);
  query.writeUInt16BE(payload.length, 4);
  query.writeUInt8(FLAGS, 6);
  query.writeUInt8(0, 7);
  serial.copy(query, 8, 0, 4);
  query.writeUInt32BE(CRC_PLACEHOLDER, 12);
  payload.copy(query, HEADER_LENGTH);
  query.writeUInt32BE(crc32(query), 12);
  return query;
}
