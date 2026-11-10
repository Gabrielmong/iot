import { request } from 'node:http';

/** Replies larger than this are refused (ONVIF replies here are a few KB). */
export const MAX_SOAP_RESPONSE_BYTES = 256 * 1024;

const ENVELOPE_NS = 'http://www.w3.org/2003/05/soap-envelope';

export interface SoapReply {
  status: number;
  body: string;
  /** The WWW-Authenticate header values (for an HTTP 401). */
  wwwAuthenticate: string[];
}

/** A SOAP 1.2 envelope around `body`, with `header` (e.g. WS-Security) when given. */
export function soapEnvelope(body: string, header = ''): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="${ENVELOPE_NS}">` +
    (header ? `<s:Header>${header}</s:Header>` : '') +
    `<s:Body>${body}</s:Body></s:Envelope>`
  );
}

/**
 * POSTs a SOAP 1.2 envelope (plain node:http). The whole exchange is bounded by `timeoutMs` and the
 * reply by MAX_SOAP_RESPONSE_BYTES. Rejects on network failure, timeout or an oversized reply; any
 * HTTP status resolves. `authorization` (an HTTP Digest answer) is sent as the Authorization header.
 * Error messages never include the envelope or the header.
 */
export function soapPost(url: string, action: string, envelope: string, timeoutMs: number, authorization?: string): Promise<SoapReply> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(envelope, 'utf8');
    const req = request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
        'Content-Length': String(payload.length),
        ...(authorization ? { Authorization: authorization } : {}),
      },
    });
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
    };
    const fail = (err: Error) => settle(() => reject(err));
    const timer = setTimeout(() => {
      fail(new Error(`timed out after ${timeoutMs} ms`));
      req.destroy();
    }, timeoutMs);
    req.on('error', fail);
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_SOAP_RESPONSE_BYTES) return void chunks.push(chunk);
        fail(new Error('response too large'));
        req.destroy();
      });
      res.on('end', () => settle(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), wwwAuthenticate: res.headersDistinct['www-authenticate'] ?? [] })));
      res.on('error', fail);
      res.on('close', () => fail(new Error('connection closed')));
    });
    req.end(payload);
  });
}
