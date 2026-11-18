import express, { type RequestHandler } from "express";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "../services/deps.js";
import { parseEnrollInput } from "./enroll-input.js";
import { redeemEnrollment } from "./enrollment.js";

export const ENROLL_PATH = "/agent/enroll";

/** POST /agent/enroll: a new agent trades its one-time code for a token. No session: the code is the proof. */
export function enrollRouter(deps: Pick<ServiceDeps, "prisma" | "manager" | "pubsub" | "now">): RequestHandler {
  const router = express.Router();
  router.post("/", express.json({ limit: 16 * 1024 }), async (req, res, next) => {
    try {
      const input = parseEnrollInput(req.body);
      if (!input) {
        res.status(400).json({ code: "BAD_REQUEST" });
        return;
      }
      const result = await redeemEnrollment(deps.prisma, input, deps.now());
      if (result === "gone") {
        res.status(410).json({ code: "GONE" });
        return;
      }
      await deps.manager.refresh();
      await publishDevicesChanged(deps.pubsub);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
