import { EventEmitter } from 'node:events';
import { connect, type Socket } from 'node:net';
import type { TuyaVersion } from '../types.js';
import { TuyaTimeoutError } from './client-errors.js';
import { decodeFrames, encodeFrame, type TuyaFrame } from './frame.js';

export interface TuyaConnectionEvents {
  frame: [TuyaFrame];
  /** The stream could not be decoded; the connection closes right after. */
  frameError: [Error];
  close: [];
}

/**
 * A framed TCP connection to one device: encodes outgoing frames with a running sequence number
 * and decodes incoming ones. Any undecodable data ends the connection, since the stream can no
 * longer be resynchronized.
 */
export class TuyaConnection extends EventEmitter<TuyaConnectionEvents> {
  private rest: Buffer = Buffer.alloc(0);
  private seq = 0;
  private closed = false;

  private constructor(
    private readonly socket: Socket,
    private readonly version: TuyaVersion,
    private key: Buffer,
  ) {
    super();
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    socket.on('error', () => {}); // always followed by 'close'
    socket.on('close', () => this.close());
  }

  /** Opens a TCP connection; rejects with {@link TuyaTimeoutError} after `timeoutMs`. */
  static open(ip: string, port: number, version: TuyaVersion, key: Buffer, timeoutMs: number): Promise<TuyaConnection> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: ip, port, noDelay: true });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new TuyaTimeoutError(`TCP connect to ${ip}:${port} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.removeAllListeners('error');
        resolve(new TuyaConnection(socket, version, key));
      });
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Switches to the negotiated session key (3.4/3.5). */
  setKey(key: Buffer): void {
    this.key = key;
  }

  /** Sends one frame and returns its seq. */
  send(cmd: number, payload: Buffer): number {
    const seq = ++this.seq;
    if (!this.closed) this.socket.write(encodeFrame({ version: this.version, key: this.key, seq, cmd, payload }));
    return seq;
  }

  /** Closes the socket and emits 'close' once (synchronously on the first call). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.emit('close');
  }

  private onData(chunk: Buffer): void {
    if (this.closed) return;
    let frames: TuyaFrame[];
    try {
      ({ frames, rest: this.rest } = decodeFrames(Buffer.concat([this.rest, chunk]), this.version, this.key));
    } catch (err) {
      this.emit('frameError', err as Error);
      this.close();
      return;
    }
    for (const frame of frames) {
      if (this.closed) return;
      this.emit('frame', frame);
    }
  }
}
