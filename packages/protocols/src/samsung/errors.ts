/** The TV refused the connection: the prompt was denied, or a stored token is no longer accepted. */
export class SamsungUnauthorizedError extends Error {
  constructor() {
    super('The TV refused the connection');
    this.name = 'SamsungUnauthorizedError';
  }
}

/** Nobody answered the TV's prompt in time. */
export class SamsungPairingTimeoutError extends Error {
  constructor() {
    super('Nobody accepted the prompt on the TV');
    this.name = 'SamsungPairingTimeoutError';
  }
}
