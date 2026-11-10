import { createServer, type Server, type Socket } from 'node:net';
import type { TuyaVersion } from '../types.js';
import { FakeTuyaSession, type FakeDeviceBehaviour, type FakeDeviceState } from './fake-tuya-session.js';

export interface FakeDeviceOptions extends FakeDeviceBehaviour {
  version: TuyaVersion;
  id: string;
  localKey: string;
  dps?: Record<string, unknown>;
}

/** An in-process Tuya device on an ephemeral localhost port, built from the package's own frame functions. */
export class FakeTuyaDevice {
  private readonly sessions = new Set<FakeTuyaSession>();
  private readonly sockets = new Set<Socket>();

  private constructor(
    private readonly server: Server,
    readonly state: FakeDeviceState,
  ) {}

  static async start(opts: FakeDeviceOptions): Promise<FakeTuyaDevice> {
    const { version, id, localKey, dps = {}, ...behaviour } = opts;
    const state: FakeDeviceState = { version, id, localKey: Buffer.from(localKey, 'utf8'), dps: { ...dps }, controls: [], log: [], behaviour };
    const server = createServer();
    const device = new FakeTuyaDevice(server, state);
    server.on('connection', (socket) => device.accept(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return device;
  }

  get port(): number {
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('fake device not listening');
    return addr.port;
  }

  get controls(): Record<string, unknown>[] {
    return this.state.controls;
  }

  get log(): string[] {
    return this.state.log;
  }

  pushStatus(dps: Record<string, unknown>): void {
    for (const s of this.sessions) s.pushStatus(dps);
  }

  sendRaw(buf: Buffer): void {
    for (const s of this.sessions) s.sendRaw(buf);
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private accept(socket: Socket): void {
    const session = new FakeTuyaSession(socket, this.state);
    this.sockets.add(socket);
    this.sessions.add(session);
    socket.on('error', () => {});
    socket.on('close', () => {
      this.sockets.delete(socket);
      this.sessions.delete(session);
    });
  }
}
