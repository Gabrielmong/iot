import { EventEmitter } from 'node:events';
import type { LightState, Rgb } from '../types.js';
import {
  decodeMessage,
  encodeBrightness,
  encodeColor,
  encodeColorTemp,
  encodeScan,
  encodeStatusRequest,
  encodeTurn,
} from './messages.js';
import { GoveeError } from './errors.js';
import { StatusCorrelator } from './status-correlator.js';
import { GoveeTransport } from './transport.js';

export interface GoveeLanOptions {
  /** Local interface address; used for the multicast interface and group membership. */
  bindAddress?: string;
  /** Port replies arrive on. Default 4002. */
  listenPort?: number;
  /** Port commands go to. Default 4003. */
  devicePort?: number;
  /** Port scans go to. Default 4001. */
  scanPort?: number;
  /** Default 239.255.255.250. */
  multicastAddress?: string;
  /** How long `status()` waits for a reply. Default 3000. */
  statusTimeoutMs?: number;
}

/**
 * Govee LAN API client. Emits `'device'` with a `GoveeDeviceInfo` for each scan reply, and
 * `'socketError'` with the Error when the UDP socket fails after start.
 */
export class GoveeLan extends EventEmitter {
  private readonly transport: GoveeTransport;
  private readonly statuses: StatusCorrelator;
  private readonly devicePort: number;
  private readonly scanPort: number;
  private readonly multicastAddress: string;

  constructor(opts: GoveeLanOptions = {}) {
    super();
    this.devicePort = opts.devicePort ?? 4003;
    this.scanPort = opts.scanPort ?? 4001;
    this.multicastAddress = opts.multicastAddress ?? '239.255.255.250';
    this.statuses = new StatusCorrelator(opts.statusTimeoutMs ?? 3000);
    this.transport = new GoveeTransport(
      { bindAddress: opts.bindAddress, listenPort: opts.listenPort ?? 4002, multicastAddress: this.multicastAddress },
      (msg, ip) => this.onDatagram(msg, ip),
      (err) => this.emit('socketError', err),
    );
  }

  /** The port the client is listening on (after `start()`). */
  get listenPort(): number {
    return this.transport.port;
  }

  start(): Promise<void> {
    return this.transport.start();
  }

  async stop(): Promise<void> {
    this.statuses.rejectAll(new GoveeError('stopped'));
    await this.transport.stop();
  }

  /**
   * Sends a scan to the multicast group, and also directly to each of `targets` (unicast) for
   * networks where multicast does not route. Replies surface as `'device'` events.
   */
  scan(targets: string[] = []): void {
    const probe = encodeScan();
    for (const ip of [this.multicastAddress, ...targets]) {
      this.transport.send(probe, ip, this.scanPort).catch((err: unknown) => this.emit('scanError', err));
    }
  }

  status(ip: string): Promise<LightState> {
    return this.statuses.request(ip, () => this.transport.send(encodeStatusRequest(), ip, this.devicePort));
  }

  setOn(ip: string, on: boolean): Promise<void> {
    return this.command(ip, encodeTurn(on));
  }

  setBrightness(ip: string, pct: number): Promise<void> {
    return this.command(ip, encodeBrightness(pct));
  }

  setColor(ip: string, rgb: Rgb): Promise<void> {
    return this.command(ip, encodeColor(rgb));
  }

  setColorTemp(ip: string, kelvin: number): Promise<void> {
    return this.command(ip, encodeColorTemp(kelvin));
  }

  private command(ip: string, payload: Buffer): Promise<void> {
    return this.transport.send(payload, ip, this.devicePort);
  }

  private onDatagram(msg: Buffer, ip: string): void {
    const decoded = decodeMessage(msg);
    if (!decoded) return;
    if (decoded.cmd === 'scan') this.emit('device', decoded.info);
    else this.statuses.deliver(ip, decoded.state);
  }
}
