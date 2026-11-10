import { X509Certificate, createHash, type KeyObject } from 'node:crypto';

function rsaParts(key: KeyObject): [Buffer, Buffer] {
  const jwk = key.export({ format: 'jwk' });
  if (!jwk.n || !jwk.e) throw new Error('Not an RSA key');
  return [Buffer.from(jwk.n, 'base64url'), Buffer.from(jwk.e, 'base64url')];
}

/**
 * The pairing secret for a 6-hex-digit code: SHA-256 over the client modulus and exponent, the TV's
 * modulus and exponent, and the code's last 4 hex digits as bytes. The hash's first byte must equal the
 * code's first 2 hex digits; when it doesn't, the code was mistyped and this returns null.
 */
export function pairingSecret(clientCertPem: string, serverCertDer: Buffer, code: string): Buffer | null {
  if (!/^[0-9a-fA-F]{6}$/.test(code)) return null;
  const [clientN, clientE] = rsaParts(new X509Certificate(clientCertPem).publicKey);
  const [serverN, serverE] = rsaParts(new X509Certificate(serverCertDer).publicKey);
  const hash = createHash('sha256')
    .update(clientN)
    .update(clientE)
    .update(serverN)
    .update(serverE)
    .update(Buffer.from(code.slice(2), 'hex'))
    .digest();
  return hash[0] === parseInt(code.slice(0, 2), 16) ? hash : null;
}
