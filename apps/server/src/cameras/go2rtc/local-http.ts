import { request } from "node:http";

export interface LocalResponse {
  status: number;
  body: Buffer;
}

export interface LocalRequestOptions {
  method: "GET" | "PATCH" | "POST" | "DELETE";
  /** Basic auth for go2rtc's API; sent on every request. */
  authorization: string;
  body?: string;
  contentType?: string;
  timeoutMs: number;
}

/**
 * One HTTP request to the local go2rtc API. node:http (not fetch) so no global timers are involved.
 * Errors never include the URL: its query may carry a stream source with credentials.
 */
export function localRequest(url: URL, opts: LocalRequestOptions): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { authorization: opts.authorization };
    if (opts.contentType) headers["content-type"] = opts.contentType;
    if (opts.body !== undefined) headers["content-length"] = String(Buffer.byteLength(opts.body));

    const req = request(url, { method: opts.method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      res.on("error", () => reject(new Error(`go2rtc ${opts.method} ${url.pathname}: response failed`)));
    });
    req.setTimeout(opts.timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", (err: NodeJS.ErrnoException) => {
      reject(new Error(`go2rtc ${opts.method} ${url.pathname}: ${err.code ?? err.message}`));
    });
    req.end(opts.body);
  });
}
