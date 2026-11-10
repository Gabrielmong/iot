import { createHash } from 'node:crypto';
import tls from 'node:tls';

/** The TV presented a certificate other than the one pinned at pairing. */
export class CertificateMismatchError extends Error {
  constructor() {
    super('TV certificate does not match the paired one');
    this.name = 'CertificateMismatchError';
  }
}

/** Lowercase hex SHA-256 of a DER certificate. */
export const certFingerprint = (der: Buffer): string => createHash('sha256').update(der).digest('hex');

export interface PinnedTlsOptions {
  /** Expected certificate SHA-256; omitted only while pairing (trust on first use). */
  pinSha256?: string;
  cert?: string;
  key?: string;
  timeoutMs: number;
}

/**
 * A TLS connection to a device with a self-signed certificate. CA validation can't apply, so the
 * certificate is checked against the pin right after the handshake, before the caller writes anything.
 * Resolves with the open socket and the certificate's fingerprint.
 */
export function connectPinned(host: string, port: number, opts: PinnedTlsOptions): Promise<{ socket: tls.TLSSocket; certSha256: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, cert: opts.cert, key: opts.key, rejectUnauthorized: false });
    const timer = setTimeout(() => fail(new Error('The device did not answer')), opts.timeoutMs);
    function fail(err: Error) {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    }
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      socket.off('error', fail);
      const certSha256 = certFingerprint(socket.getPeerCertificate().raw);
      if (opts.pinSha256 !== undefined && certSha256 !== opts.pinSha256) return fail(new CertificateMismatchError());
      resolve({ socket, certSha256 });
    });
  });
}
