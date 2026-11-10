import { request } from 'node:http';
import { KasaError } from './errors.js';

export interface KlapHttpResponse {
  status: number;
  body: Buffer;
  /** Every `name=value` pair from the Set-Cookie headers (the device sends `TP_SESSIONID=…;TIMEOUT=…`). */
  cookies: Map<string, string>;
}

/** Raw transport: POST `body` with exactly these header names, resolve status, body and Set-Cookie lines. */
export type KlapHttpPost = (
  url: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number,
) => Promise<{ status: number; body: Buffer; setCookies: string[] }>;

export interface KlapPostOptions {
  timeoutMs: number;
  /** Sent as the Cookie header. Only TP_SESSIONID: python-kasa notes devices dislike getting TIMEOUT back. */
  cookie?: string;
  /** Injectable for tests; defaults to node:http. */
  httpPost?: KlapHttpPost;
}

/** POSTs raw bytes and returns the status, body and cookies. Network failures and timeouts become KasaError. */
export async function klapPost(url: string, body: Buffer, opts: KlapPostOptions): Promise<KlapHttpResponse> {
  // Header names are case-sensitive on KP303 firmware (SHIP 2.0): it answers 400 to "content-length".
  // fetch/undici always lowercases header names, so we use node:http, which keeps them as written.
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(body.length),
  };
  if (opts.cookie) headers.Cookie = opts.cookie;
  try {
    const res = await (opts.httpPost ?? nodeHttpPost)(url, body, headers, opts.timeoutMs);
    return { status: res.status, body: res.body, cookies: parseSetCookies(res.setCookies) };
  } catch (err) {
    throw new KasaError(`KLAP POST ${url} failed: ${(err as Error).message}`, { cause: err });
  }
}

export const nodeHttpPost: KlapHttpPost = (url, body, headers, timeoutMs) =>
  new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks), setCookies: res.headers['set-cookie'] ?? [] }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end(body);
  });

function parseSetCookies(setCookies: string[]): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const header of setCookies) {
    // Like Python's SimpleCookie, treat unknown "attributes" such as TIMEOUT as cookies of their own.
    for (const pair of header.split(';')) {
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  return cookies;
}
