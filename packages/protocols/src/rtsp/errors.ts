/** A failure talking to an RTSP server: bad URL, connection errors, malformed replies. Never carries credentials. */
export class RtspError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RtspError';
  }
}

/** The RTSP server did not connect or answer in time. `url` has its userinfo stripped. */
export class RtspTimeoutError extends RtspError {
  constructor(
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`RTSP server at ${url} did not answer within ${timeoutMs} ms`);
    this.name = 'RtspTimeoutError';
  }
}

/** The server asked only for authentication schemes we refuse to use (e.g. Basic when not allowed). No credentials were sent. */
export class RtspAuthUnsupportedError extends RtspError {
  constructor(
    readonly url: string,
    readonly schemes: readonly string[],
  ) {
    super(`RTSP server at ${url} requested an unsupported or insecure authentication method (${schemes.join(', ')})`);
    this.name = 'RtspAuthUnsupportedError';
  }
}
