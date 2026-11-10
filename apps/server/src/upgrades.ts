import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

/** Takes a WebSocket upgrade it serves and returns true; returns false to pass it on. */
export type UpgradeRoute = (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean;

/**
 * The decoded path of an origin-form request target ("/a/b?x"), or null when the target is anything
 * else (absolute-form, empty, undecodable). Never throws.
 */
export function requestPath(url: string | undefined): string | null {
  const raw = (url ?? "").split("?", 1)[0]!;
  if (!raw.startsWith("/")) return null;
  try {
    decodeURIComponent(raw);
  } catch {
    return null;
  }
  return raw;
}

/**
 * Routes WebSocket upgrades by path (each WebSocket server runs in `noServer` mode: ws servers bound
 * to one HTTP server with different paths would reject each other's upgrades). A malformed target, or
 * any error while routing, gets 400; an unknown path 404. Nothing here can crash the process.
 */
export function routeUpgrades(server: Server, routes: UpgradeRoute[]): void {
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => undefined);
    try {
      if (requestPath(req.url) === null) return reject(socket, "400 Bad Request");
      if (routes.some((route) => route(req, socket, head))) return;
      reject(socket, "404 Not Found");
    } catch {
      reject(socket, "400 Bad Request");
    }
  });
}

/** A route for one exact path (raw, query ignored). */
export function pathRoute(path: string, handle: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): UpgradeRoute {
  return (req, socket, head) => {
    if (requestPath(req.url) !== path) return false;
    handle(req, socket, head);
    return true;
  };
}

function reject(socket: Duplex, status: string): void {
  if (socket.writable) socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
