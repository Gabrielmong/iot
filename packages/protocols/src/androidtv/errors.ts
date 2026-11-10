/** The code typed doesn't match the one the TV shows (checked locally; the exchange stays open). */
export class AndroidTvBadCodeError extends Error {
  constructor() {
    super('Wrong pairing code');
    this.name = 'AndroidTvBadCodeError';
  }
}

/** The TV ended or refused the pairing exchange. */
export class AndroidTvPairingFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AndroidTvPairingFailedError';
  }
}

export { CertificateMismatchError } from '../net/pinned-tls.js';

/** The TV refused our client certificate: its pairing with this app was removed (or reset) on the TV. */
export class AndroidTvNotPairedError extends Error {
  constructor() {
    super('The TV no longer knows this app; pair it again');
    this.name = 'AndroidTvNotPairedError';
  }
}
