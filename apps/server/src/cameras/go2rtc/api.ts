import { basicAuthHeader, type Go2rtcCredentials } from "./credentials.js";
import { go2rtcErrorDetail } from "./error-detail.js";
import { parseStreamInfo, type StreamInfo } from "./stream-info.js";

export type { StreamInfo } from "./stream-info.js";
import { localRequest, type LocalRequestOptions } from "./local-http.js";

/** go2rtc's HTTP API; matches `api.listen` in the generated config. */
export const GO2RTC_API_URL = "http://127.0.0.1:1984";

const REQUEST_TIMEOUT_MS = 10_000;

/** What `GET /api` reports; `config_path` identifies which go2rtc instance answered. */
export interface Go2rtcInfo {
  version?: string;
  config_path?: string;
}

/**
 * A non-2xx answer. The message names the path and status only, never a stream source; `detail` is
 * go2rtc's error text when it is safe to log (see go2rtcErrorDetail).
 */
export class Go2rtcHttpError extends Error {
  constructor(
    readonly status: number,
    method: string,
    path: string,
    readonly detail?: string,
  ) {
    super(`go2rtc ${method} ${path} failed: HTTP ${status}`);
    this.name = "Go2rtcHttpError";
  }
}

/** Client for go2rtc's localhost HTTP API, authenticated with the per-run credentials. */
export class Go2rtcApi {
  private readonly authorization: string;

  constructor(
    credentials: Go2rtcCredentials,
    private readonly baseUrl = GO2RTC_API_URL,
  ) {
    this.authorization = basicAuthHeader(credentials);
  }

  /** `GET /api`: go2rtc is up; its info says which instance it is. */
  async info(timeoutMs = REQUEST_TIMEOUT_MS): Promise<Go2rtcInfo> {
    const body = await this.call("/api", {}, { method: "GET", timeoutMs });
    return JSON.parse(body.toString("utf8")) as Go2rtcInfo;
  }

  /**
   * Adds or replaces a stream in go2rtc's memory. PATCH, not PUT: go2rtc's PUT also writes the stream
   * (with its credentials) into the config file on disk.
   */
  async putStream(name: string, src: string): Promise<void> {
    await this.call("/api/streams", { name, src }, { method: "PATCH" });
  }

  /** go2rtc's delete takes the stream name in the `src` key. */
  async deleteStream(name: string): Promise<void> {
    await this.call("/api/streams", { src: name }, { method: "DELETE" });
  }

  async webrtcAnswer(name: string, offerSdp: string): Promise<string> {
    const body = await this.call("/api/webrtc", { src: name }, { method: "POST", body: offerSdp, contentType: "application/sdp" });
    return body.toString("utf8");
  }

  frameJpeg(name: string): Promise<Buffer> {
    return this.call("/api/frame.jpeg", { src: name }, { method: "GET" });
  }

  /**
   * `GET /api/streams?src=<name>`: the stream's producers (active or not) and consumers, or null when go2rtc has no such
   * stream. Without media parameters go2rtc only reads the stream (adds no probe consumer).
   */
  async streamInfo(name: string): Promise<StreamInfo | null> {
    let body: Buffer;
    try {
      body = await this.call("/api/streams", { src: name }, { method: "GET" });
    } catch (err) {
      if (err instanceof Go2rtcHttpError && err.status === 404) return null;
      throw err;
    }
    return parseStreamInfo(body);
  }

  /** go2rtc's MSE WebSocket for a stream (proxied by the server, never handed to the browser). */
  mseUrl(name: string): string {
    const url = new URL("/api/ws", this.baseUrl);
    return `ws://${url.host}${url.pathname}?src=${encodeURIComponent(name)}`;
  }

  /** Headers for connections opened outside this client (the MSE WebSocket). */
  authHeaders(): { authorization: string } {
    return { authorization: this.authorization };
  }

  private async call(
    path: string,
    query: Record<string, string>,
    opts: Omit<LocalRequestOptions, "timeoutMs" | "authorization"> & { timeoutMs?: number },
  ): Promise<Buffer> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await localRequest(url, { timeoutMs: REQUEST_TIMEOUT_MS, authorization: this.authorization, ...opts });
    if (res.status < 200 || res.status >= 300) throw new Go2rtcHttpError(res.status, opts.method, path, go2rtcErrorDetail(res.body));
    return res.body;
  }
}
