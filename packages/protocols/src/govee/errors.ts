/** A failure talking to a Govee device. */
export class GoveeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GoveeError';
  }
}

/** A `devStatus` request got no reply in time. */
export class GoveeTimeoutError extends GoveeError {
  constructor(
    readonly ip: string,
    readonly timeoutMs: number,
  ) {
    super(`Govee device ${ip} did not answer within ${timeoutMs} ms`);
    this.name = 'GoveeTimeoutError';
  }
}
