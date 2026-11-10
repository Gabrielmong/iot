import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import vector from '../test/fixtures/androidtv-pairing.json' with { type: 'json' };
import { pairingSecret } from './pairing-secret.js';

const tvDer = new X509Certificate(vector.tvCertPem).raw;

describe('pairingSecret', () => {
  it('matches the androidtv-remote algorithm for the right code (any case)', () => {
    expect(pairingSecret(vector.clientCertPem, tvDer, vector.code)?.toString('hex')).toBe(vector.secretHex);
    expect(pairingSecret(vector.clientCertPem, tvDer, vector.code.toLowerCase())?.toString('hex')).toBe(vector.secretHex);
  });

  it('is null when the check byte does not match, or the code is malformed', () => {
    const wrongCheck = ((parseInt(vector.code.slice(0, 2), 16) + 1) % 256).toString(16).padStart(2, '0') + vector.code.slice(2);
    expect(pairingSecret(vector.clientCertPem, tvDer, wrongCheck)).toBeNull();
    expect(pairingSecret(vector.clientCertPem, tvDer, '12345')).toBeNull();
    expect(pairingSecret(vector.clientCertPem, tvDer, 'zzzzzz')).toBeNull();
  });
});
