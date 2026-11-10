import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import { certSha256, createClientCertificate } from './certificate.js';

describe('createClientCertificate', () => {
  it('makes an RSA-2048 self-signed PEM pair TLS accepts, CN home-control', () => {
    const { certPem, keyPem } = createClientCertificate();
    expect(() => tls.createSecureContext({ cert: certPem, key: keyPem })).not.toThrow();
    const x = new X509Certificate(certPem);
    expect(x.subject).toContain('CN=home-control');
    expect(x.publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);
    expect(certSha256(x.raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});
