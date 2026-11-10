import { getOperationAST, parse, type DocumentNode, type GraphQLSchema } from "graphql";
import { useServer } from "graphql-ws/use/ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { coded } from "../../api-errors.js";
import { checkSession } from "../../auth/sessions.js";
import type { ServiceDeps } from "../../services/deps.js";
import { announceExpiry } from "../../services/session-events.js";
import { sessionContext, type ApiContext } from "../context.js";
import { maskResult, type ErrorLog } from "../error-masking.js";
import { SESSION_CLOSE_CODE, SessionWatch } from "./session-watch.js";

export interface SubscriptionsOptions {
  log: ErrorLog;
  /** Largest accepted WebSocket message, in bytes (matches the HTTP body limit). */
  maxPayload: number;
  /** Periodic session re-check per socket (at most 30 s). */
  sessionCheckMs?: number;
}

type ConnectionExtra = { session: { token: string; watch: SessionWatch } };

/**
 * graphql-ws on the HTTP server, for subscriptions only: queries and mutations go over HTTP, where
 * the session is resolved per request. A socket authenticates with `connectionParams.authToken`;
 * without a valid session it is closed with 4401. Every operation and every event re-reads the
 * session (read-only), so a demoted or signed-out user is not served with stale rights. Nothing on
 * this path slides the session. The server routes upgrades for the GraphQL path to `handleUpgrade`.
 */
export function attachSubscriptions(schema: GraphQLSchema, deps: ServiceDeps, opts: SubscriptionsOptions) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: opts.maxPayload });

  const server = useServer<Record<string, unknown>, ConnectionExtra>(
    {
      schema,
      onConnect: async (ctx) => {
        const token = typeof ctx.connectionParams?.authToken === "string" ? ctx.connectionParams.authToken : null;
        const user = token ? await checkSession(deps.prisma, token, deps.now(), announceExpiry(deps.sessionEvents)) : null;
        const socket = ctx.extra.socket;
        if (socket.readyState !== WebSocket.OPEN) return false; // closed while the session was checked
        if (!token || !user) {
          socket.close(SESSION_CLOSE_CODE, "Unauthorized");
          return false;
        }
        const watch = new SessionWatch(deps.prisma, token, socket, deps.now, opts.sessionCheckMs, announceExpiry(deps.sessionEvents));
        ctx.extra.session = { token, watch };
        return true;
      },
      onSubscribe: (_ctx, _id, payload) => {
        if (!isSubscription(payload.query, payload.operationName)) return [coded("BAD_REQUEST", "Only subscriptions over WebSocket")];
        return undefined;
      },
      context: async (ctx): Promise<ApiContext> => {
        const session = ctx.extra.session;
        const user = session ? await session.watch.check() : null;
        return sessionContext(deps, user, session?.token ?? null, session?.watch);
      },
      onNext: (_ctx, _id, _payload, _args, result) => maskResult(result, opts.log),
      onClose: (ctx) => ctx.extra.session?.watch.stop(),
    },
    wss,
  );

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    },
    /** Closes every socket and the WebSocket server. */
    async dispose(): Promise<void> {
      await server.dispose();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

/** True for a document whose selected operation is a subscription; unparsable documents are left to graphql-ws. */
function isSubscription(query: string, operationName: string | null | undefined): boolean {
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch {
    return true; // graphql-ws reports the syntax error itself
  }
  return getOperationAST(doc, operationName)?.operation === "subscription";
}
