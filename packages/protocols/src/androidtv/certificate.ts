import { createHash, randomBytes } from 'node:crypto';
import forge from 'node-forge';

export interface ClientCertificate {
  certPem: string;
  keyPem: string;
}

/** A self-signed RSA-2048 client certificate (CN home-control); the TV remembers it once paired. */
export function createClientCertificate(): ClientCertificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + randomBytes(15).toString('hex');
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.UTC(2099, 0, 1));
  const subject = [{ name: 'commonName', value: 'home-control' }];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

/** Lowercase hex SHA-256 of a DER certificate: what a TV connection is pinned to. */
export const certSha256 = (der: Buffer): string => createHash('sha256').update(der).digest('hex');
