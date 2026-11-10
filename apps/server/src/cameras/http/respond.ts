import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { failureReason } from "../failure-reason.js";
import { unavailableCode } from "./unavailable-code.js";

const CODES = { 400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 404: "NOT_FOUND", 413: "TOO_LARGE", 503: "CAMERA_UNAVAILABLE" } as const;
export type FailStatus = keyof typeof CODES;

/** An error answer: a small `{code}` body and nothing else, so no detail (stream name, source URL) can leak. */
export function fail(res: Response, status: FailStatus, code: string = CODES[status]): void {
  res.status(status).set("cache-control", "no-store").json({ code });
}

/**
 * Wraps a handler so any failure (go2rtc, the registry, the database) becomes a bare 503 (its code
 * says only whether the Tuya cloud refused the stream); `what` and a sanitized reason are logged.
 */
export function guarded(log: Pick<Console, "warn">, what: string, handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      log.warn(`cameras: ${what} for ${req.params.id ?? "?"} failed (${failureReason(err)})`);
      if (!res.headersSent) fail(res, 503, unavailableCode(err));
    }
  };
}

/** Body-parser errors (oversized or malformed offers) as `{code}`, never Express's HTML error page. */
export const bodyErrors: ErrorRequestHandler = (err: { status?: number }, _req, res, _next) => {
  fail(res, err.status === 413 ? 413 : 400);
};
