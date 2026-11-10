export type TuyaErrorOptions = ErrorOptions & { code?: number };

/** Tuya cloud rejected the credentials (bad access id / secret / signature). */
export class TuyaCloudAuthError extends Error {
  /** Tuya's error code, when the cloud answered with one. */
  readonly code: number | undefined;
  constructor(message: string, options?: TuyaErrorOptions) {
    super(message, options);
    this.name = 'TuyaCloudAuthError';
    this.code = options?.code;
  }
}

/** The Tuya IoT Core subscription (trial) has lapsed, so the API refuses every call. */
export class TuyaCloudExpiredError extends Error {
  /** Tuya's error code, when the cloud answered with one. */
  readonly code: number | undefined;
  constructor(message: string, options?: TuyaErrorOptions) {
    super(message, options);
    this.name = 'TuyaCloudExpiredError';
    this.code = options?.code;
  }
}

/** Any other failure talking to the Tuya cloud. */
export class TuyaCloudError extends Error {
  /** Tuya's error code, when the cloud answered with one. */
  readonly code: number | undefined;
  constructor(message: string, options?: TuyaErrorOptions) {
    super(message, options);
    this.name = 'TuyaCloudError';
    this.code = options?.code;
  }
}

/**
 * The Tuya cloud would not give a stream URL for a camera (service not enabled, device not in the
 * project, cloud unreachable, ...). The message is fixed: it never carries a stream URL.
 */
export class TuyaCloudStreamUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Tuya cloud stream not available', options);
    this.name = 'TuyaCloudStreamUnavailableError';
  }
}

/**
 * Tuya error codes. UNVERIFIED: recalled from Tuya's docs, to be confirmed against real Tuya in
 * Task 15; any unknown code falls back to the generic TuyaCloudError.
 * https://developer.tuya.com/en/docs/iot/error-code
 */
export const TUYA_TOKEN_INVALID_CODE = 1010;
export const TUYA_AUTH_ERROR_CODES: ReadonlySet<number> = new Set([
  1001, // secret/clientId missing or wrong
  1004, // sign invalid
  1005, // clientId invalid
]);
export const TUYA_EXPIRED_ERROR_CODES: ReadonlySet<number> = new Set([
  28841002, // no permission: API not subscribed (IoT Core)
  28841105, // no permission: IoT Core subscription expired
]);

/** Turns a Tuya `{success:false, code, msg}` reply into the matching error. */
export function cloudErrorFor(code: number | undefined, msg: string | undefined): Error {
  const text = `Tuya cloud error ${code ?? '?'}: ${msg ?? 'unknown'}`;
  if (code !== undefined && TUYA_EXPIRED_ERROR_CODES.has(code)) return new TuyaCloudExpiredError(text, { code });
  if (code !== undefined && TUYA_AUTH_ERROR_CODES.has(code)) return new TuyaCloudAuthError(text, { code });
  return new TuyaCloudError(text, { code });
}

/**
 * Whether a failure is the account's (credentials rejected, subscription lapsed), not the camera's or
 * the stream type's: asking again with another stream type cannot help. Looks through a
 * TuyaCloudStreamUnavailableError to its cause.
 */
export function isCloudAccountRefusal(err: unknown): boolean {
  const inner = err instanceof TuyaCloudStreamUnavailableError ? err.cause : err;
  return inner instanceof TuyaCloudAuthError || inner instanceof TuyaCloudExpiredError;
}
