import { generateKeyPair } from 'node:crypto';

let pem: Promise<string> | undefined;

/**
 * The RSA public key (2048-bit, SPKI PEM) sent in discovery probes. Devices use it to encrypt the
 * optional `encrypt_info` blob, which this package does not read, so the private key is discarded.
 * Generated once per process, as python-kasa caches its key pair.
 */
export function discoveryPublicKeyPem(): Promise<string> {
  pem ??= new Promise<string>((resolve, reject) =>
    generateKeyPair('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }, (err, publicKey) =>
      err ? reject(err) : resolve(publicKey),
    ),
  );
  pem.catch(() => (pem = undefined));
  return pem;
}
