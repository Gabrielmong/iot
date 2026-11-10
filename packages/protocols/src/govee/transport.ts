import { createSocket, type Socket } from 'node:dgram';
import { isIPv4 } from 'node:net';

export interface TransportOptions {
  bindAddress?: string;
  listenPort: number;
  multicastAddress: string;
}

export type DatagramHandler = (msg: Buffer, fromIp: string) => void;
export type SocketErrorHandler = (err: Error) => void;

const isMulticast = (addr: string): boolean => {
  if (!isIPv4(addr)) return false;
  const first = Number(addr.split('.')[0]);
  return first >= 224 && first <= 239;
};

/** One UDP socket on the listen port: receives replies, sends scans and commands. */
export class GoveeTransport {
  private socket?: Socket;
  private starting?: Promise<void>;

  constructor(
    private readonly opts: TransportOptions,
    private readonly onDatagram: DatagramHandler,
    private readonly onError: SocketErrorHandler = () => undefined,
  ) {}

  /** The bound port (useful when started with port 0). */
  get port(): number {
    return this.socket?.address().port ?? 0;
  }

  /** Idempotent; concurrent calls share one start. */
  start(): Promise<void> {
    if (this.socket) return Promise.resolve();
    this.starting ??= this.open().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  /** Closes the socket; if a start is in flight, waits for it to bind and then closes. */
  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  send(data: Buffer, ip: string, port: number): Promise<void> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error('GoveeLan is not started'));
    return new Promise((resolve, reject) => socket.send(data, port, ip, (err) => (err ? reject(err) : resolve())));
  }

  private async open(): Promise<void> {
    const { bindAddress, listenPort, multicastAddress } = this.opts;
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, rinfo) => this.onDatagram(msg, rinfo.address));
    // Stays attached for the socket's lifetime so a runtime error never crashes the process.
    socket.on('error', (err) => this.onError(err));
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(listenPort, bindAddress, () => {
          socket.off('error', reject);
          resolve();
        });
      });
      if (isMulticast(multicastAddress)) {
        if (bindAddress) socket.setMulticastInterface(bindAddress);
        socket.addMembership(multicastAddress, bindAddress);
      }
    } catch (err) {
      socket.close();
      throw err;
    }
    this.socket = socket;
  }
}
