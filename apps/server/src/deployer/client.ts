import { readFile } from "node:fs/promises";
import { badInput, coded } from "../api-errors.js";
import type { Command, DeployerClient, StatusView } from "./types.js";

/** status and log: the page polls them. */
const READ_TIMEOUT_MS = 5000;
/** Commands: Deploy now asks GitHub about each new commit before it answers. */
const COMMAND_TIMEOUT_MS = 30_000;
const unavailable = () => coded("UNAVAILABLE", "The deploy helper isn't running");

type Reply = { status: number; body: any };

/** Talks to the deploy helper on localhost. The token file is re-read on every call (the helper rotates it). */
export function httpDeployerClient(url: string, tokenFile: string | undefined, fetchImpl: typeof fetch = fetch): DeployerClient {
  /** undefined: no token, network error, timeout or 401. */
  async function call(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<Reply | undefined> {
    if (!tokenFile) return undefined;
    try {
      const token = (await readFile(tokenFile, "utf8")).trim();
      const res = await fetchImpl(new URL(path, url), {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(init.timeoutMs ?? READ_TIMEOUT_MS),
      });
      if (res.status === 401) return undefined;
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch {
      return undefined;
    }
  }

  return {
    async status() {
      const r = await call("/status");
      return r?.status === 200 ? (r.body as StatusView) : undefined;
    },
    async log(id) {
      const r = await call(`/events/${encodeURIComponent(id)}/log`);
      return r?.status === 200 && typeof r.body.log === "string" ? r.body.log : null;
    },
    async command(c: Command) {
      const r = await call("/commands", { method: "POST", body: c, timeoutMs: COMMAND_TIMEOUT_MS });
      if (!r) throw unavailable();
      const message = typeof r.body.error === "string" ? r.body.error : "The deploy helper refused the request";
      if (r.status === 202 && typeof r.body.eventId === "string") return r.body.eventId;
      if (r.status === 409) throw coded("CONFLICT", message);
      if (r.status === 400) throw badInput(message);
      if (r.status === 404) throw coded("NOT_FOUND", typeof r.body.error === "string" ? r.body.error : "Deploy event not found");
      throw unavailable();
    },
  };
}

/** The client when no token file is configured. */
export const unavailableDeployer: DeployerClient = {
  status: async () => undefined,
  log: async () => null,
  command: async () => Promise.reject(unavailable()),
};
