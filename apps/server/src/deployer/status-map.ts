import type { CiCommitView, StatusView } from "./types.js";

/** GraphQL ids are strings; the helper's run and job ids are GitHub's numbers. */
function toApiCommit(c: CiCommitView) {
  return {
    sha: c.sha,
    message: c.message,
    committedAt: c.committedAt,
    runs: c.runs.map((r) => ({
      id: String(r.id),
      attempt: r.attempt,
      workflow: r.workflow,
      gatesDeploy: r.gatesDeploy,
      state: r.state,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      url: r.url,
      jobs: r.jobs.map((j) => ({ ...j, id: String(j.id) })),
    })),
  };
}

/** The GraphQL DeployStatus; `undefined` (helper down) gives `available: false` with empty fields. */
export function toApiDeployStatus(s: StatusView | undefined) {
  if (!s) return { available: false, autoDeploy: false, helperUpdateAvailable: false, events: [], commits: [] };
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
    commits: (s.ci?.commits ?? []).map(toApiCommit),
    ciError: s.ci?.error ?? null,
    ciCheckedAt: s.ci?.lastCheckAt ?? null,
  };
}
