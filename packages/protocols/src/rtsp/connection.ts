import { connect, type Socket } from 'node:net';
import { RtspError, RtspTimeoutError } from './errors.js';
import { parseRtspResponse, type RtspResponse } from './response.js';
import type { RtspTarget } from './url.js';

/**
 * One RTSP-over-TCP connection that carries sequential request/response exchanges.
 * Connecting and each exchange are bounded by `timeoutMs`; errors name only the userinfo-free target URL.
 */
export class RtspConnection {
  private buffer = Buffer.alloc(0);
  private onResponse: ((res: RtspResponse) => void) | undefined;
  private onFailure: ((err: Error) => void) | undefined;
  private isClosed = false;

  private constructor(
    private readonly socket: Socket,
    private readonly target: RtspTarget,
    private readonly timeoutMs: number,
  ) {
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (err) => {
      this.isClosed = true; // node destroys the socket after 'error'
      this.onFailure?.(new RtspError(`RTSP connection to ${target.url} failed`, { cause: err }));
    });
    socket.on('close', () => {
      this.isClosed = true;
      this.onFailure?.(new RtspError(`RTSP connection to ${target.url} closed`));
    });
  }

  static open(target: RtspTarget, timeoutMs: number): Promise<RtspConnection> {
    const socket = connect({ host: target.host, port: target.port });
    const conn = new RtspConnection(socket, target, timeoutMs);
    return conn.track<RtspConnection>((resolve) => socket.once('connect', () => resolve(conn)));
  }

  get closed(): boolean {
    return this.isClosed;
  }

  exchange(request: string): Promise<RtspResponse> {
    if (this.isClosed) return Promise.reject(new RtspError(`RTSP connection to ${this.target.url} closed`));
    this.buffer = Buffer.alloc(0);
    return this.track<RtspResponse>((resolve) => {
      this.onResponse = resolve;
      this.socket.write(request);
    });
  }

  close(): void {
    this.isClosed = true;
    this.socket.destroy();
  }

  /** Settles on `begin`'s resolve, a socket failure, or the timeout (which also closes the socket). */
  private track<T>(begin: (resolve: (value: T) => void) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.onResponse = undefined;
        this.onFailure = undefined;
      };
      const timer = setTimeout(() => {
        done();
        this.close();
        reject(new RtspTimeoutError(this.target.url, this.timeoutMs));
      }, this.timeoutMs);
      this.onFailure = (err) => {
        done();
        reject(err);
      };
      begin((value) => {
        done();
        resolve(value);
      });
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.onResponse) return;
    let parsed: ReturnType<typeof parseRtspResponse>;
    try {
      parsed = parseRtspResponse(this.buffer);
    } catch (err) {
      this.onFailure?.(err as Error);
      this.close();
      return;
    }
    if (!parsed) return;
    this.buffer = this.buffer.subarray(parsed.consumed);
    this.onResponse(parsed.response);
  }
}
