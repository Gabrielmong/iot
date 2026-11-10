import { describe, expect, it } from 'vitest';
import { hex, kasaVectors } from '../test/kasa-vectors.js';
import { authHash, handshake1Hash, handshake2Hash, matchServerHash } from './klap-auth.js';

describe.each(kasaVectors)('KLAP auth ($variant vector)', (v) => {
  const local = hex(v.localSeedHex);
  const remote = hex(v.remoteSeedHex);
  const serverHash = hex(v.handshake1ResponseHex).subarray(16);

  it('derives the auth hash', () => {
    expect(authHash(v.variant, v.username, v.password).toString('hex')).toBe(v.authHashHex);
  });

  it('computes the server hash the device sends in handshake1', () => {
    expect(handshake1Hash(v.variant, local, remote, hex(v.authHashHex))).toEqual(serverHash);
  });

  it('computes the handshake2 payload', () => {
    expect(handshake2Hash(v.variant, local, remote, hex(v.authHashHex)).toString('hex')).toBe(v.handshake2Hex);
  });

  it('matches the server hash to this variant using the user credentials', () => {
    const match = matchServerHash(local, remote, serverHash, { username: v.username, password: v.password });
    expect(match?.variant).toBe(v.variant);
    expect(match?.authHash.toString('hex')).toBe(v.authHashHex);
  });

  it('finds no match for a wrong password', () => {
    expect(matchServerHash(local, remote, serverHash, { username: v.username, password: 'wrong' })).toBeUndefined();
  });
});

describe('matchServerHash fallbacks (as python-kasa)', () => {
  const local = Buffer.alloc(16, 1);
  const remote = Buffer.alloc(16, 2);
  const user = { username: 'me@example.com', password: 'secret' };

  it('accepts the hardcoded kasa setup credentials', () => {
    const auth = authHash('v2', 'kasa@tp-link.net', 'kasaSetup');
    const match = matchServerHash(local, remote, handshake1Hash('v2', local, remote, auth), user);
    expect(match).toEqual({ variant: 'v2', authHash: auth });
  });

  it('accepts blank credentials', () => {
    const auth = authHash('v1', '', '');
    const match = matchServerHash(local, remote, handshake1Hash('v1', local, remote, auth), user);
    expect(match).toEqual({ variant: 'v1', authHash: auth });
  });
});
