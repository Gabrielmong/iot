/** A failure talking to an ONVIF camera. Messages never contain credentials or stream URIs. */
export class OnvifError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OnvifError';
  }
}

/** The camera rejected the username or password (HTTP 401 or a NotAuthorized / FailedAuthentication fault). */
export class OnvifAuthError extends OnvifError {
  constructor(readonly host: string) {
    super(`ONVIF camera ${host} rejected the username or password`);
    this.name = 'OnvifAuthError';
  }
}

/** No ONVIF service answered, or it did not answer in time or within the size limit. */
export class OnvifUnreachableError extends OnvifError {
  constructor(
    readonly host: string,
    options?: ErrorOptions,
  ) {
    super(`ONVIF camera ${host} did not answer`, options);
    this.name = 'OnvifUnreachableError';
  }
}

/** The camera answered but offered no RTSP stream (no profiles, or GetProfiles / GetStreamUri failed). */
export class OnvifNoStreamError extends OnvifError {
  constructor(readonly host: string) {
    super(`ONVIF camera ${host} offered no RTSP stream`);
    this.name = 'OnvifNoStreamError';
  }
}

/** A SOAP fault (or non-200 reply) that is not an authentication failure. Internal: callers map it to the above. */
export class OnvifFaultError extends OnvifError {
  constructor(
    readonly host: string,
    readonly status: number,
  ) {
    super(`ONVIF camera ${host} answered with a fault (HTTP ${status})`);
    this.name = 'OnvifFaultError';
  }
}
