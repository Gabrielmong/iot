import { createSocket, type Socket } from 'node:dgram';

export interface FakeGoveeOptions {
  /** Info returned for scans. */
  info?: { ip: string; device: string; sku: string };
  /** Status data returned for devStatus. */
  status?: Record<string, unknown>;
  /** Never answer devStatus. */
  silent?: boolean;
  /** Delay before answering devStatus. */
  statusDelayMs?: number;
}

const DEFAULT_INFO = { ip: '127.0.0.1', device: 'AA:BB', sku: 'H618C' };

/** A fake Govee light on localhost: separate scan and command sockets, replies to `replyPort`. */
export class FakeGoveeDevice {
  readonly received: { cmd: string; data: Record<string, unknown> }[] = [];
  replyPort = 0;
  scanPort = 0;
  devicePort = 0;
  private scanSocket?: Socket;
  private cmdSocket?: Socket;

  constructor(readonly opts: FakeGoveeOptions = {}) {}

  async start(): Promise<void> {
    this.scanSocket = await this.bind((cmd) => {
      if (cmd === 'scan') this.reply({ cmd: 'scan', data: this.opts.info ?? DEFAULT_INFO });
    });
    this.cmdSocket = await this.bind((cmd, data) => {
      this.received.push({ cmd, data });
      if (cmd !== 'devStatus' || this.opts.silent) return;
      const send = (): void => this.reply({ cmd: 'devStatus', data: this.opts.status ?? {} });
      if (this.opts.statusDelayMs) setTimeout(send, this.opts.statusDelayMs);
      else send();
    });
    this.scanPort = this.scanSocket.address().port;
    this.devicePort = this.cmdSocket.address().port;
  }

  async stop(): Promise<void> {
    const sockets = [this.scanSocket, this.cmdSocket];
    this.scanSocket = this.cmdSocket = undefined;
    await Promise.all(sockets.map((s) => s && new Promise<void>((r) => s.close(() => r()))));
  }

  private reply(msg: unknown): void {
    this.cmdSocket?.send(Buffer.from(JSON.stringify({ msg })), this.replyPort, '127.0.0.1');
  }

  private bind(onMsg: (cmd: string, data: Record<string, unknown>) => void): Promise<Socket> {
    const socket = createSocket('udp4');
    socket.on('message', (buf) => {
      const { msg } = JSON.parse(buf.toString()) as { msg: { cmd: string; data: Record<string, unknown> } };
      onMsg(msg.cmd, msg.data);
    });
    return new Promise((resolve) => socket.bind(0, '127.0.0.1', () => resolve(socket)));
  }
}
