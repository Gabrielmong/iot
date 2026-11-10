import type { StatusView } from "./types.js";

/** The GraphQL DeployStatus; `undefined` (helper down) gives `available: false` with empty fields. */
export function toApiDeployStatus(s: StatusView | undefined) {
  if (!s) return { available: false, autoDeploy: false, helperUpdateAvailable: false, events: [] };
  return {
    available: true,
    running: s.running ?? null,
    autoDeploy: s.autoDeploy.on,
    pausedReason: s.autoDeploy.reason ?? null,
    lastCheckAt: s.lastCheck?.at ?? null,
    lastCheckError: s.lastCheck?.error ?? null,
    busy: s.busy ?? null,
    helperUpdateAvailable: s.helperUpdateAvailable,
    events: s.events,
  };
}
