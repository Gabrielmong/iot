import { EventEmitter } from "node:events";
import { encode, type AgentMessage, type ServerMessage } from "./protocol.js";

/** What the hub needs of a connection (a ws WebSocket in production). */
export interface AgentConnection {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Events {
  connected: [deviceId: string];
  /** A newer connection took over from a live one (the PC stays connected). */
  replaced: [deviceId: string];
  disconnected: [deviceId: string];
  message: [deviceId: string, msg: AgentMessage];
}

/**
 * The live HomeAgent connections, one per PC. A newer connection for a PC replaces the older one
 * (closed without a `disconnected`), so an agent restart racing its old socket's close never shows the PC off.
 */
export class AgentHub extends EventEmitter<Events> {
  private readonly conns = new Map<string, { conn: AgentConnection; version: number | null }>();

  attach(deviceId: string, conn: AgentConnection): void {
    const old = this.conns.get(deviceId);
    this.conns.set(deviceId, { conn, version: null });
    if (old) {
      old.conn.close(4000, "replaced");
      this.emit("replaced", deviceId);
    } else this.emit("connected", deviceId);
  }

  /** Forgets `conn` if it is still the PC's connection; true when the PC is now disconnected. */
  detach(deviceId: string, conn: AgentConnection): boolean {
    if (this.conns.get(deviceId)?.conn !== conn) return false;
    this.conns.delete(deviceId);
    this.emit("disconnected", deviceId);
    return true;
  }

  /** Records the version a hello reported. */
  setVersion(deviceId: string, version: number): void {
    const c = this.conns.get(deviceId);
    if (c) c.version = version;
  }

  received(deviceId: string, msg: AgentMessage): void {
    this.emit("message", deviceId, msg);
  }

  /** Sends to the PC's agent; false when it isn't connected. */
  send(deviceId: string, msg: ServerMessage): boolean {
    const c = this.conns.get(deviceId);
    if (!c) return false;
    c.conn.send(encode(msg));
    return true;
  }

  isConnected(deviceId: string): boolean {
    return this.conns.has(deviceId);
  }

  info(deviceId: string): { version: number } | null {
    const c = this.conns.get(deviceId);
    return c && c.version !== null ? { version: c.version } : null;
  }

  closeAll(): void {
    for (const { conn } of this.conns.values()) conn.close(1001, "server stopping");
    this.conns.clear();
  }
}
