import { createHmac, randomBytes } from 'node:crypto';
import type { Socket } from 'node:net';
import { TuyaCmd } from '../tuya/constants.js';
import { deriveSessionKey } from '../tuya/crypto.js';
import { frameLength } from '../tuya/frame-length.js';
import { decodeFrames, encodeFrame } from '../tuya/frame.js';
import { PREFIX_6699 } from '../tuya/wire.js';
import type { TuyaVersion } from '../types.js';

export interface FakeDeviceBehaviour {
  /** Never answers DP_QUERY or CONTROL. */
  silent?: boolean;
  /** Never answers heartbeats. */
  ignoreHeartbeats?: boolean;
  /** Answers a DP query with an empty ack, then the dps in a STATUS frame. */
  ackQueryBeforeStatus?: boolean;
  /** A STATUS payload pushed just before each DP query reply (e.g. a partial dps push, or non-JSON). */
  statusBeforeQueryReply?: Buffer;
  /** Replaces the DP query reply payload (e.g. non-JSON). */
  queryReplyPayload?: Buffer;
  /** Delays the reply to the first DP query. */
  firstQueryReplyDelayMs?: number;
  /** Delays every CONTROL ack (the STATUS push still goes out at once). */
  controlAckDelayMs?: number;
  /** Pushes STATUS for a CONTROL but never acks it. */
  withholdControlAck?: boolean;
  /** Acks a CONTROL without pushing STATUS (as a device whose STATUS arrives late or not at all). */
  noStatusOnControl?: boolean;
  /** Overrides the SESS_KEY_NEG_RESP payload (to test malformed replies). */
  respPayload?: (clientNonce: Buffer) => Buffer;
}

export interface FakeDeviceState {
  version: TuyaVersion;
  id: string;
  localKey: Buffer;
  dps: Record<string, unknown>;
  /** dps of every CONTROL received, in order. */
  controls: Record<string, unknown>[];
  /** Order of query/control traffic, e.g. "recv query", "reply query", "recv control". */
  log: string[];
  behaviour: FakeDeviceBehaviour;
}

const isNewProtocol = (v: TuyaVersion) => v === '3.4' || v === '3.5';

/**
 * One client connection to the fake device. Behaves like a real Tuya device: frames it cannot
 * decode (e.g. sent with a wrong key) are still answered, encrypted with the device's own key.
 * Replies echo the request seq on 55AA versions; 3.5 replies and all pushes use the device's own counter.
 */
export class FakeTuyaSession {
  private key: Buffer;
  private seq = 1000;
  private rest: Buffer = Buffer.alloc(0);
  private queries = 0;
  private readonly deviceNonce = randomBytes(16);
  private clientNonce = Buffer.alloc(16);

  constructor(
    private readonly socket: Socket,
    private readonly state: FakeDeviceState,
  ) {
    this.key = state.localKey;
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
  }

  /** Sends a STATUS push with the given dps. */
  pushStatus(dps: Record<string, unknown>): void {
    const t = Math.floor(Date.now() / 1000);
    const body = isNewProtocol(this.state.version) ? { protocol: 4, t, data: { dps } } : { devId: this.state.id, dps, t };
    this.send(TuyaCmd.STATUS, Buffer.from(JSON.stringify(body)));
  }

  sendRaw(buf: Buffer): void {
    this.socket.write(buf);
  }

  private onData(chunk: Buffer): void {
    let buf = Buffer.concat([this.rest, chunk]);
    for (;;) {
      const len = frameLength(buf);
      if (len === undefined || buf.length < len) break;
      this.handle(buf.subarray(0, len));
      buf = buf.subarray(len);
    }
    this.rest = buf;
  }

  private handle(raw: Buffer): void {
    const is6699 = raw.readUInt32BE(0) === PREFIX_6699;
    const seq = raw.readUInt32BE(is6699 ? 6 : 4);
    const cmd = raw.readUInt32BE(is6699 ? 10 : 8);
    const payload = this.tryDecode(raw);
    switch (cmd) {
      case TuyaCmd.SESS_KEY_NEG_START:
        return this.onStart(seq, payload);
      case TuyaCmd.SESS_KEY_NEG_FINISH:
        this.key = deriveSessionKey(this.state.version as '3.4' | '3.5', this.state.localKey, this.clientNonce, this.deviceNonce);
        return;
      case TuyaCmd.DP_QUERY:
      case TuyaCmd.DP_QUERY_NEW:
        return this.onQuery(seq, cmd);
      case TuyaCmd.CONTROL:
      case TuyaCmd.CONTROL_NEW:
        return this.onControl(seq, cmd, payload);
      case TuyaCmd.HEART_BEAT:
        if (!this.state.behaviour.ignoreHeartbeats) this.send(TuyaCmd.HEART_BEAT, Buffer.alloc(0), seq);
    }
  }

  private tryDecode(raw: Buffer): Buffer | undefined {
    try {
      return decodeFrames(raw, this.state.version, this.key, { hasRetcode: false }).frames[0]?.payload;
    } catch {
      return undefined;
    }
  }

  private onStart(seq: number, nonce: Buffer | undefined): void {
    if (nonce) this.clientNonce = Buffer.from(nonce);
    const custom = this.state.behaviour.respPayload;
    const hmac = createHmac('sha256', this.state.localKey).update(this.clientNonce).digest();
    this.send(TuyaCmd.SESS_KEY_NEG_RESP, custom ? custom(this.clientNonce) : Buffer.concat([this.deviceNonce, hmac]), seq);
  }

  private onQuery(seq: number, cmd: number): void {
    const b = this.state.behaviour;
    this.state.log.push('recv query');
    if (b.silent) return;
    const delay = this.queries++ === 0 ? (b.firstQueryReplyDelayMs ?? 0) : 0;
    later(delay, () => {
      this.state.log.push('reply query');
      if (b.statusBeforeQueryReply) this.send(TuyaCmd.STATUS, b.statusBeforeQueryReply);
      if (b.ackQueryBeforeStatus) {
        this.send(cmd, Buffer.alloc(0), seq);
        this.pushStatus(this.state.dps);
        return;
      }
      const reply = b.queryReplyPayload ?? Buffer.from(JSON.stringify({ devId: this.state.id, dps: this.state.dps }));
      this.send(cmd, reply, seq);
    });
  }

  private onControl(seq: number, cmd: number, payload: Buffer | undefined): void {
    const b = this.state.behaviour;
    this.state.log.push('recv control');
    if (b.silent || !payload) return;
    const body = JSON.parse(payload.toString()) as { dps?: Record<string, unknown>; data?: { dps?: Record<string, unknown> } };
    const dps = body.dps ?? body.data?.dps ?? {};
    this.state.controls.push(dps);
    Object.assign(this.state.dps, dps);
    if (!b.noStatusOnControl) this.pushStatus(dps);
    if (b.withholdControlAck) return;
    later(b.controlAckDelayMs ?? 0, () => this.send(cmd, Buffer.alloc(0), seq));
  }

  /** Sends a frame: a reply echoing `replyTo` (55AA only), or a push with the device's own seq. */
  private send(cmd: number, payload: Buffer, replyTo?: number): void {
    if (this.socket.destroyed) return;
    const seq = replyTo !== undefined && this.state.version !== '3.5' ? replyTo : ++this.seq;
    this.socket.write(encodeFrame({ version: this.state.version, key: this.key, seq, cmd, payload, retcode: 0 }));
  }
}

function later(ms: number, fn: () => void): void {
  if (ms > 0) setTimeout(fn, ms);
  else fn();
}
