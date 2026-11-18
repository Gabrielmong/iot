import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { PrismaClient } from "../generated/prisma/client.js";
import { applyHello, updateOffer } from "./hello.js";
import type { AgentHub } from "./hub.js";
import { encode, parseAgentMessage } from "./protocol.js";
import { clearRemoval, pendingRemoval } from "./removals.js";
import { sha256Hex } from "./tokens.js";

export const AGENT_WS_PATH = "/agent/ws";

export interface AgentSocketDeps {
  prisma: PrismaClient;
  agents: AgentHub;
  now: () => Date;
  log: Pick<Console, "warn">;
  /** Called after a hello changed the PC's IP (the drivers must be re-synced). */
  onDeviceChanged?: (deviceId: string) => void;
}

function bearer(header: string | undefined): string | null {
  const m = /^Bearer (\S+)$/.exec(header ?? "");
  return m ? m[1]! : null;
}

function reject(socket: Duplex, status: string): void {
  if (socket.writable) socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * The HomeAgent endpoint. A paired PC's token connects it; a removed PC's token (< 90 days) is told to
 * uninstall; anything else gets 401 before the upgrade. A socket silent for `idleMs` is closed.
 */
export function createAgentSockets(deps: AgentSocketDeps, opts: { agentDir?: string; idleMs?: number } = {}) {
  const idleMs = opts.idleMs ?? 90_000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  function onHello(ws: WebSocket, deviceId: string, msg: Extract<ReturnType<typeof parseAgentMessage>, { t: "hello" }>): void {
    deps.agents.setVersion(deviceId, msg.version);
    const offer = updateOffer(opts.agentDir, msg.version);
    if (offer) ws.send(encode(offer));
    applyHello(deps.prisma, deviceId, msg)
      .then((ipChanged) => ipChanged && deps.onDeviceChanged?.(deviceId))
      .catch((e: unknown) => deps.log.warn(`agent hello for ${deviceId} failed: ${String(e)}`));
  }

  function serve(ws: WebSocket, tokenHash: string, deviceId: string | null): void {
    let idle: NodeJS.Timeout | undefined;
    const touch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ws.close(4001, "idle"), idleMs);
    };
    touch();
    if (deviceId) deps.agents.attach(deviceId, ws);
    else ws.send(encode({ t: "uninstall" }));
    ws.on("message", (data) => {
      touch();
      const msg = parseAgentMessage(String(data));
      if (!msg) return;
      if (msg.t === "uninstall.ack") {
        void clearRemoval(deps.prisma, tokenHash).finally(() => ws.close(1000, "uninstalled"));
        return;
      }
      if (!deviceId) return;
      if (msg.t === "hello") onHello(ws, deviceId, msg);
      deps.agents.received(deviceId, msg);
    });
    ws.on("close", () => {
      clearTimeout(idle);
      if (deviceId) deps.agents.detach(deviceId, ws);
    });
    ws.on("error", () => undefined);
  }

  async function admit(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const token = bearer(req.headers.authorization);
    if (!token) return reject(socket, "401 Unauthorized");
    const tokenHash = sha256Hex(token);
    const device = await deps.prisma.device.findUnique({ where: { agentTokenHash: tokenHash }, select: { id: true } });
    if (!device && !(await pendingRemoval(deps.prisma, tokenHash, deps.now()))) return reject(socket, "401 Unauthorized");
    wss.handleUpgrade(req, socket, head, (ws) => serve(ws, tokenHash, device?.id ?? null));
  }

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
      admit(req, socket, head).catch(() => reject(socket, "500 Internal Server Error"));
    },
    async dispose(): Promise<void> {
      deps.agents.closeAll();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
