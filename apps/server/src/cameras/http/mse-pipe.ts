import { WebSocket } from "ws";
import { CLOSE_UNAVAILABLE } from "../streams/close-codes.js";
import type { MseInbox } from "./mse-inbox.js";

/**
 * Joins an authorised client socket to go2rtc's MSE WebSocket (authenticated with the API's
 * credentials; the URL never leaves the server). Messages flow both ways unchanged; when either side
 * closes, so does the other.
 */
export function pipeToUpstream(client: WebSocket, inbox: MseInbox, url: string, headers: Record<string, string>): void {
  const upstream = new WebSocket(url, { headers, perMessageDeflate: false });

  upstream.on("open", () => inbox.forwardTo(({ data, isBinary }) => upstream.send(data as Buffer, { binary: isBinary })));
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data as Buffer, { binary: isBinary });
  });
  upstream.on("close", () => closeClient(client, 1000, "Stream ended"));
  upstream.on("error", () => closeClient(client, CLOSE_UNAVAILABLE, "Camera unavailable"));
  client.once("close", () => upstream.terminate());
}

function closeClient(client: WebSocket, code: number, reason: string): void {
  if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close(code, reason);
}
