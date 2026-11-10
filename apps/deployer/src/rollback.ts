import { existsSync } from 'node:fs';
import { actualRunning } from './actual-running.js';
import type { DeployEvent } from './history.js';
import { releaseMigrations, rollbackBlockedReason } from './migrations.js';
import { type OpContext, errorText, openLog, short } from './op-context.js';
import { OpError } from './op-error.js';
import { isCurrent, releaseDir } from './releases.js';
import { currentRelease, restorePrevious, switchTo } from './switch-to.js';

function shippedMigrations(dir: string): string[] {
  try {
    return releaseMigrations(dir);
  } catch {
    return []; // a release without a migrations folder can't be trusted with any applied one
  }
}

/** Throws OpError unless `sha` is a kept release, not the running one, and safe for the database. */
export async function assertCanRollback(ctx: OpContext, sha: string): Promise<void> {
  const state = ctx.history.state();
  const dir = releaseDir(ctx.paths, sha);
  if (!state.releases.includes(sha) || !existsSync(dir)) throw new OpError(`Unknown release ${short(sha)}`, 404);
  if (state.running?.sha === sha || isCurrent(ctx.paths, sha)) throw new OpError(`Already running ${short(sha)}`, 400);
  let applied: string[];
  try {
    applied = await ctx.migrations.applied();
  } catch {
    throw new OpError("Can't read the database's migrations, so a rollback can't be checked right now", 400);
  }
  const blocked = rollbackBlockedReason(applied, shippedMigrations(dir));
  if (blocked !== undefined) throw new OpError(blocked, 400);
}

const messageOf = (ctx: OpContext, sha: string) =>
  ctx.history.events().find((e) => e.sha === sha && e.kind === 'DEPLOY' && e.status === 'SUCCEEDED')?.message ?? '';

export async function rollbackTo(ctx: OpContext, sha: string, by: string): Promise<DeployEvent> {
  await assertCanRollback(ctx, sha);
  const message = messageOf(ctx, sha);
  const ev = ctx.history.start({ kind: 'ROLLBACK', sha, message, by });
  const { log, redact } = openLog(ctx, ev.id);
  const prev = currentRelease(ctx);
  let detail: string | undefined;
  try {
    if (await switchTo(ctx, sha, log)) {
      ctx.history.update({
        running: { sha, message, deployedAt: ctx.now().toISOString() },
        autoDeploy: { on: false, reason: `rolled back to ${short(sha)}` },
      });
    } else if (prev === undefined) {
      detail = `${short(sha)} didn't come up; there was no previous version to go back to`;
    } else {
      const back = await restorePrevious(ctx, prev, log);
      detail =
        back === 'restored'
          ? `${short(sha)} didn't come up; switched back to ${prev}`
          : back === 'stayed'
            ? `couldn't switch to ${short(sha)}; still running ${prev}`
            : `${short(sha)} didn't come up; switching back to ${prev} also failed`;
    }
  } catch (e) {
    detail = `Rollback stopped unexpectedly: ${errorText(e)}`;
  }
  if (detail !== undefined) {
    log.line(`✖ ${detail}`);
    const running = actualRunning(ctx); // a failed switch back may have left the target in place
    if (running) ctx.history.update({ running });
  }
  ctx.history.finish(ev.id, detail === undefined ? 'SUCCEEDED' : 'FAILED', detail === undefined ? undefined : redact(detail));
  return ctx.history.events().find((e) => e.id === ev.id) ?? ev;
}
