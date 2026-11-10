import express, { type RequestHandler } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const GRAPHQL_PATH = "/graphql";
/** Every non-GraphQL API route lives under here; the SPA fallback never answers it. */
export const API_PATH = "/api";
/** Largest accepted request body, over HTTP and per WebSocket message. */
export const MAX_BODY_BYTES = 100 * 1024;

export interface HttpAppOptions {
  graphql: RequestHandler;
  /** Mounted handlers under API_PATH (e.g. the camera endpoints), keyed by their full path. */
  api?: Record<string, RequestHandler>;
  /** Serve the built web app from here (production). */
  webDist?: string;
}

/**
 * The Express app: the GraphQL endpoint, the API routes and, when `webDist` exists (production), the
 * web app's static files with an SPA fallback to index.html on the same port.
 */
export function createHttpApp(opts: HttpAppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(GRAPHQL_PATH, express.json({ limit: MAX_BODY_BYTES }), opts.graphql);
  for (const [path, handler] of Object.entries(opts.api ?? {})) app.use(path, handler);
  if (opts.webDist && existsSync(opts.webDist)) serveWebApp(app, opts.webDist);
  return app;
}

function serveWebApp(app: express.Express, webDist: string): void {
  app.use(express.static(webDist, { index: "index.html" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || isApiPath(req.path)) return next();
    res.sendFile(join(webDist, "index.html"));
  });
}

function isApiPath(path: string): boolean {
  return path.startsWith(GRAPHQL_PATH) || path === API_PATH || path.startsWith(`${API_PATH}/`);
}
