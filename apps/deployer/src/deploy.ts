import { actualRunning } from './actual-running.js';
import { backupIfNeeded, buildRelease, migrate, removeRelease } from './deploy-steps.js';
import type { EventLog } from './event-log.js';
import { forgetServiceSettings, saveServiceSettings } from './first-deploy-service.js';
import type { Commit } from './github.js';
import type { DeployEvent } from './history.js';
import { type OpContext, errorText, openLog } from './op-context.js';
import { step } from './op-steps.js';
import { pruneReleases, releaseDir } from './releases.js';
import { RESTORE_TEXT, restoreInstall } from './restore-install.js';
import { activate, currentRelease, ensureStarted, restorePrevious } from './switch-to.js';

export type { OpContext } from './op-context.js';

type Outcome = { ok: true } | { ok: false; detail: string };

const failed = (detail: string): Outcome => ({ ok: false, detail });

/** A first deploy failed before any migration ran: back to the install HomeControl ran before. */
async function backToOldInstall(ctx: OpContext, why: string, log: EventLog, stopFirst: boolean): Promise<Outcome> {
  return failed(`${why}; ${RESTORE_TEXT[await restoreInstall(ctx, log, stopFirst)]}`);
}

/** Health failed after the switch: decide what stays running (steps 13 and 14). */
async function afterFailedStart(
  ctx: OpContext,
  old: string | undefined,
  pending: string[],
  log: EventLog,
): Promise<Outcome> {
  if (pending.length > 0) {
    // The database already moved on; the old code may not work with it. Leave the new release.
    await ensureStarted(ctx, log);
    return failed("app didn't come up after a database change; push a fix");
  }
  if (old === undefined) return backToOldInstall(ctx, "didn't come up", log, true);
  const back = await restorePrevious(ctx, old, log);
  if (back === 'restored') return failed(`didn't come up; rolled back automatically to ${old}`);
  if (back === 'stayed') return failed(`didn't come up; still running ${old}`);
  return failed(`didn't come up; switching back to ${old} also failed`);
}

function readDatabaseUrl(ctx: OpContext): string {
  const url = ctx.appEnv().DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing from .env');
  return url;
}

async function deploy(ctx: OpContext, commit: Commit, log: EventLog): Promise<Outcome> {
  const { sha } = commit;
  const dir = releaseDir(ctx.paths, sha);
  const old = currentRelease(ctx);
  const first = old === undefined; // HomeControl still runs the install from before the helper
  const still = (why: string) => (first ? why : `${why}; still running ${old}`);
  const service = ctx.config.serviceName;

  let databaseUrl: string;
  let pending: string[];
  try {
    databaseUrl = readDatabaseUrl(ctx);
    await buildRelease(ctx, sha, dir, log);
    pending = await backupIfNeeded(ctx, dir, log);
    if (first) await step(log, 'Save service settings', () => saveServiceSettings(ctx));
  } catch (e) {
    removeRelease(ctx, sha, log);
    return failed(still(errorText(e)));
  }

  try {
    await step(log, 'Stop app', () => ctx.sys.serviceStop(service));
  } catch (e) {
    if (first) return backToOldInstall(ctx, errorText(e), log, false);
    await ensureStarted(ctx, log);
    return failed(still(errorText(e)));
  }

  try {
    await migrate(ctx, dir, databaseUrl, log);
  } catch {
    // Nothing was repointed yet: the service still runs the old version (or old install) when started.
    await ensureStarted(ctx, log);
    return failed(first ? 'migration failed; started the previous install again' : `migration failed; still running ${old}`);
  }

  if (await activate(ctx, sha, log)) {
    forgetServiceSettings(ctx.paths); // also clears one a first deploy left after a failed post-migration start
    return { ok: true };
  }
  return afterFailedStart(ctx, old, pending, log);
}

function record(ctx: OpContext, commit: Commit, outcome: Outcome, log: EventLog): void {
  const { sha, message } = commit;
  const state = ctx.history.state();
  if (!outcome.ok) {
    // state.running follows what `current` really points at (it may be the new, failed release).
    const failedShas = state.failedShas.includes(sha) ? state.failedShas : [...state.failedShas, sha];
    const running = actualRunning(ctx);
    ctx.history.update({ failedShas, ...(running ? { running } : {}) });
    return;
  }
  const running = { sha, message, deployedAt: ctx.now().toISOString() };
  const releases = [sha, ...state.releases.filter((s) => s !== sha)].slice(0, ctx.config.keepReleases);
  ctx.history.update({ running, releases, failedShas: state.failedShas.filter((s) => s !== sha) });
  try {
    pruneReleases(ctx.paths, releases);
  } catch (e) {
    log.line(`Couldn't remove old releases: ${errorText(e)}`);
  }
}

export async function deployCommit(ctx: OpContext, commit: Commit, by: string): Promise<DeployEvent> {
  const ev = ctx.history.start({ kind: 'DEPLOY', sha: commit.sha, message: commit.message, by });
  const { log, redact } = openLog(ctx, ev.id);
  let outcome: Outcome;
  try {
    outcome = await deploy(ctx, commit, log);
  } catch (e) {
    outcome = failed(`Deploy stopped unexpectedly: ${errorText(e)}`);
  }
  if (!outcome.ok) log.line(`✖ ${outcome.detail}`);
  record(ctx, commit, outcome, log);
  ctx.history.finish(ev.id, outcome.ok ? 'SUCCEEDED' : 'FAILED', outcome.ok ? undefined : redact(outcome.detail));
  return ctx.history.events().find((e) => e.id === ev.id) ?? ev;
}
