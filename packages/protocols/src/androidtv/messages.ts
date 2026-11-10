import protobuf from 'protobufjs';
import { PAIRING_PROTO, REMOTE_PROTO } from './proto.js';

/** Pairing status codes (PairingMessage.status). */
export const PAIRING_STATUS_OK = 200;
export const PAIRING_STATUS_BAD_SECRET = 402;
export const PAIRING_PROTOCOL_VERSION = 2;
export const ROLE_TYPE_INPUT = 1;
export const ENCODING_TYPE_HEXADECIMAL = 3;
/** RemoteKeyInject.direction for a single press. */
export const KEY_DIRECTION_SHORT = 3;

export interface PairingMessage {
  protocolVersion?: number;
  status?: number;
  pairingRequest?: { serviceName?: string; clientName?: string };
  pairingRequestAck?: { serverName?: string };
  pairingOption?: { inputEncodings?: { type?: number; symbolLength?: number }[]; outputEncodings?: { type?: number; symbolLength?: number }[]; preferredRole?: number };
  pairingConfiguration?: { encoding?: { type?: number; symbolLength?: number }; clientRole?: number };
  pairingConfigurationAck?: Record<string, never>;
  pairingSecret?: { secret?: Uint8Array };
  pairingSecretAck?: { secret?: Uint8Array };
}

export interface RemoteMessage {
  remoteConfigure?: { code1?: number; deviceInfo?: { model?: string; vendor?: string; unknown1?: number; unknown2?: string; packageName?: string; appVersion?: string } };
  remoteSetActive?: { active?: number };
  remoteError?: { value?: boolean };
  remotePingRequest?: { val1?: number; val2?: number };
  remotePingResponse?: { val1?: number };
  remoteKeyInject?: { keyCode?: number; direction?: number };
  remoteStart?: { started?: boolean };
  remoteAppLinkLaunchRequest?: { appLink?: string };
}

const pairingType = protobuf.parse(PAIRING_PROTO, { keepCase: false }).root.lookupType('pairing.PairingMessage');
const remoteType = protobuf.parse(REMOTE_PROTO, { keepCase: false }).root.lookupType('remote.RemoteMessage');

const toObject = { defaults: false, longs: Number, enums: Number, bytes: Buffer } as const;

function encode(type: protobuf.Type, payload: object): Buffer {
  const err = type.verify(payload);
  if (err) throw new Error(`Invalid ${type.name}: ${err}`);
  return Buffer.from(type.encodeDelimited(type.create(payload)).finish());
}

/** One frame: varint length prefix + PairingMessage. */
export const encodePairing = (m: PairingMessage): Buffer => encode(pairingType, m);
/** Decodes one frame's body (without its length prefix). */
export const decodePairing = (body: Buffer): PairingMessage => pairingType.toObject(pairingType.decode(body), toObject) as PairingMessage;

export const encodeRemote = (m: RemoteMessage): Buffer => encode(remoteType, m);
export const decodeRemote = (body: Buffer): RemoteMessage => remoteType.toObject(remoteType.decode(body), toObject) as RemoteMessage;

/** Reads a varint at the start of `buf`: [value, bytes used], or undefined when it is incomplete. */
function readVarint(buf: Buffer): [number, number] | undefined {
  let value = 0;
  for (let i = 0; i < Math.min(buf.length, 5); i++) {
    value += (buf[i] & 0x7f) * 2 ** (7 * i);
    if ((buf[i] & 0x80) === 0) return [value, i + 1];
  }
  if (buf.length >= 5) throw new Error('Bad frame length');
  return undefined;
}

/** No real message comes near this; a larger declared length is a broken or hostile peer. */
export const MAX_FRAME_BYTES = 64 * 1024;

/** Cuts a TCP stream into frame bodies (varint length-prefixed), across chunk boundaries. */
export class FrameReader {
  private pending: Buffer = Buffer.alloc(0);

  /** Adds a chunk and returns the bodies of every frame now complete. */
  push(chunk: Buffer): Buffer[] {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const frames: Buffer[] = [];
    for (;;) {
      const header = readVarint(this.pending);
      if (!header) break;
      const [length, used] = header;
      if (length > MAX_FRAME_BYTES) throw new Error('Frame too large');
      if (this.pending.length < used + length) break;
      frames.push(this.pending.subarray(used, used + length));
      this.pending = this.pending.subarray(used + length);
    }
    return frames;
  }
}
