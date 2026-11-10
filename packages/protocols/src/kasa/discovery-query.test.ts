import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildDiscoveryQuery } from './discovery-query.js';

const PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjAN\n-----END PUBLIC KEY-----\n';

describe('buildDiscoveryQuery (python-kasa _AesDiscoveryQuery)', () => {
  const serial = Buffer.from('a1b2c3d4', 'hex');
  const query = buildDiscoveryQuery(PEM, serial);
  const payload = JSON.stringify({ params: { rsa_key: PEM } });

  it('writes the TDP v2 probe header', () => {
    expect(query.subarray(0, 12).toString('hex')).toBe(
      ['02', '00', '0001', Buffer.byteLength(payload).toString(16).padStart(4, '0'), '11', '00', 'a1b2c3d4'].join(''),
    );
  });

  it('appends the compact rsa_key JSON payload', () => {
    expect(query.subarray(16).toString('utf8')).toBe(payload);
  });

  it('replaces the 0x5A6B7C8D placeholder with the crc32 of the whole packet', () => {
    const withPlaceholder = Buffer.from(query);
    withPlaceholder.writeUInt32BE(0x5a6b7c8d, 12);
    expect(query.readUInt32BE(12)).toBe(crc32(withPlaceholder));
  });

  it('matches python-kasa 0.12.0 byte-for-byte for the same key and serial', () => {
    // From _AesDiscoveryQuery.generate_query() with this PEM as keypair and secrets.token_bytes patched to a1b2c3d4.
    expect(query.toString('hex')).toBe(
      '0200000100591100a1b2c3d4af37bdbf7b22706172616d73223a7b227273615f6b6579223a222d2d2d2d2d424547494e205055424c4943204b45592d2d2d2d2d5c6e4d494942496a414e5c6e2d2d2d2d2d454e44205055424c4943204b45592d2d2d2d2d5c6e227d7d',
    );
  });
});
