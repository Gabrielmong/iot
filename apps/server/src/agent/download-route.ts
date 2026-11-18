import express, { type RequestHandler, type Response } from "express";
import { createReadStream } from "node:fs";
import type { PrismaClient } from "../generated/prisma/client.js";
import { readAgentInfo, type AgentInfo } from "./agent-store.js";
import { enrollmentValid } from "./enrollment.js";
import { trailer } from "./trailer.js";

export const AGENT_FILES_PATH = "/agent";
/** Where agents fetch updates (the plain exe; its hash is in the update message). */
export const AGENT_EXE_URL = `${AGENT_FILES_PATH}/HomeAgent.exe`;

function published(res: Response, dir: string | undefined): AgentInfo | null {
  const info = readAgentInfo(dir);
  if (!info) res.status(503).json({ code: "UNAVAILABLE", message: "The agent isn't available yet" });
  return info;
}

/**
 * GET /agent/download/:code — the exe plus a trailer that pairs it with this server (code checked, not used up);
 * GET /agent/HomeAgent.exe — the plain exe, for updates.
 */
export function agentFilesRouter(deps: { prisma: PrismaClient; now: () => Date; agentDir?: string }): RequestHandler {
  const router = express.Router();
  router.get("/download/:code", async (req, res, next) => {
    try {
      const code = req.params.code;
      if (!(await enrollmentValid(deps.prisma, code, deps.now()))) {
        res.status(410).json({ code: "GONE" });
        return;
      }
      const info = published(res, deps.agentDir);
      if (!info) return;
      res.set({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="HomeAgent-${code.slice(0, 8)}.exe"`, "Cache-Control": "no-store" });
      const tail = trailer({ server: `http://${req.headers.host}`, code });
      const stream = createReadStream(info.exePath);
      stream.on("error", next);
      stream.on("end", () => res.end(tail));
      stream.pipe(res, { end: false });
    } catch (error) {
      next(error);
    }
  });
  router.get("/HomeAgent.exe", (_req, res) => {
    const info = published(res, deps.agentDir);
    if (info) res.sendFile(info.exePath, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
  });
  return router;
}
