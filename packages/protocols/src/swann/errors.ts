/** A failure probing a Swann recorder. Messages never contain credentials. */
export class SwannError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SwannError';
  }
}

/** The recorder still answered 401 after an authorised DESCRIBE, or asked for an auth scheme we refuse to use. */
export class SwannAuthError extends SwannError {
  constructor(
    readonly host: string,
    reason = 'rejected the username or password',
    options?: ErrorOptions,
  ) {
    super(`Swann recorder ${host} ${reason}`, options);
    this.name = 'SwannAuthError';
  }
}

/** The recorder could not be reached or did not answer RTSP in time. */
export class SwannUnreachableError extends SwannError {
  constructor(
    readonly host: string,
    options?: ErrorOptions,
  ) {
    super(`Swann recorder ${host} is not reachable over RTSP`, options);
    this.name = 'SwannUnreachableError';
  }
}

/** No known stream path template answered for channel 1. */
export class SwannNoStreamsError extends SwannError {
  constructor(readonly host: string) {
    super(`Swann recorder ${host} offered no stream on any known path`);
    this.name = 'SwannNoStreamsError';
  }
}
