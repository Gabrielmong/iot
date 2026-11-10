/** Longest go2rtc error text kept for logs. */
const MAX_DETAIL = 120;

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
/**
 * Anything that could be (part of) a URL, a path or a login: `@ % / \`, or a word glued to a colon
 * (`rtsps:x`, `user:pass`); or a long hex token, such as a stream name's random part.
 */
const URL_LIKE = /[@%/\\]|[a-z][a-z0-9+.-]*:[^\s]|[0-9a-f]{16}/i;

/**
 * go2rtc's error body made safe to log: control characters are stripped first (so they cannot split
 * a scheme or a login past the checks), then the text is dropped entirely if anything in it looks
 * URL-, path- or login-like, else kept on one line of at most 120 characters. Plain messages such
 * as "streams: wrong response on DESCRIBE" pass; the caller always logs the HTTP status anyway.
 */
export function go2rtcErrorDetail(body: Buffer): string | undefined {
  const text = body.toString("utf8").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (!text || URL_LIKE.test(text)) return undefined;
  return text.slice(0, MAX_DETAIL);
}
