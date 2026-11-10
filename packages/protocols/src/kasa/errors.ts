/** A failure talking to a Kasa device: transport errors, unexpected HTTP statuses, bad replies. */
export class KasaError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KasaError';
  }
}

/** The device's handshake1 proof matched none of the credentials tried: wrong username or password. */
export class KasaAuthError extends KasaError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KasaAuthError';
  }
}

/** The device understood the request but reported a non-zero `err_code`. */
export class KasaDeviceError extends KasaError {
  constructor(
    message: string,
    readonly errCode: number,
  ) {
    super(message);
    this.name = 'KasaDeviceError';
  }
}
