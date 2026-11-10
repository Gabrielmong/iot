/** Serialises an RTSP request with no body. Header values must not contain CR/LF. */
export function formatRtspRequest(method: string, url: string, headers: readonly (readonly [string, string])[]): string {
  const lines = [`${method} ${url} RTSP/1.0`, ...headers.map(([name, value]) => `${name}: ${value}`)];
  return `${lines.join('\r\n')}\r\n\r\n`;
}
