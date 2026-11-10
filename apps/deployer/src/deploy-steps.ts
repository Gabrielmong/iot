import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { EventLog } from './event-log.js';
import { pendingMigrations, releaseMigrations } from './migrations.js';
import { type OpContext, errorText, short } from './op-context.js';
import { run, runScript, step } from './op-steps.js';
import { isCurrent, releaseDir } from './releases.js';

function fetchRepo(ctx: OpContext, log: EventLog): Promise<void> {
  const { bin, branch, stepTimeoutsMs } = ctx.config;
  const args = ['-C', ctx.paths.repo, 'fetch', 'origin', branch];
  return step(log, 'Fetch', () =>
    run(ctx, log, bin.git, args, { env: ctx.gitEnv(), timeoutMs: stepTimeoutsMs.fetch }),
  );
}

function exportRelease(ctx: OpContext, sha: string, dir: string, log: EventLog): Promise<void> {
  const { bin, stepTimeoutsMs } = ctx.config;
  const timeoutMs = stepTimeoutsMs.export;
  return step(log, 'Export', async () => {
    if (isCurrent(ctx.paths, sha)) throw new Error(`${short(sha)} is the release running now`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(ctx.paths.data, { recursive: true });
    const tar = path.join(ctx.paths.data, `export-${short(sha)}.tar`);
    try {
      await run(ctx, log, bin.git, ['-C', ctx.paths.repo, 'archive', '-o', tar, sha], { timeoutMs });
      mkdirSync(dir, { recursive: true });
      await run(ctx, log, bin.tar, ['-xf', tar, '-C', dir], { timeoutMs });
    } finally {
      rmSync(tar, { force: true });
    }
  });
}

/** Steps 1–6: fetch, export, helpers, install, build, lock down. Nothing running is touched. */
export async function buildRelease(ctx: OpContext, sha: string, dir: string, log: EventLog): Promise<void> {
  const { bin, stepTimeoutsMs: t } = ctx.config;
  const pnpm = (args: string[], timeoutMs: number) => run(ctx, log, bin.pnpm, args, { cwd: dir, timeoutMs });
  const helperArgs = ['-Target', path.join(dir, 'tools'), '-Cache', ctx.paths.toolsCache];
  await fetchRepo(ctx, log);
  await exportRelease(ctx, sha, dir, log);
  await step(log, 'Helpers', () => runScript(ctx, log, dir, 'install-helpers', helperArgs, t.helpers));
  await step(log, 'Install', () =>
    pnpm(['install', '--frozen-lockfile', '--config.package-import-method=copy', '--store-dir', ctx.paths.pnpmStore], t.install),
  );
  await step(log, 'Build', () => pnpm(['build'], t.build));
  await step(log, 'Lock down', () => runScript(ctx, log, dir, 'protect-release', ['-Path', dir], t.protect));
}

/** Step 7: backs the database up when the release brings migrations. Returns the pending ones. */
export function backupIfNeeded(ctx: OpContext, dir: string, log: EventLog): Promise<string[]> {
  return step(log, 'Backup', async () => {
    const pending = pendingMigrations(await ctx.migrations.applied(), releaseMigrations(dir));
    if (pending.length === 0) {
      log.line('No pending migrations; no backup needed');
    } else {
      log.line(`Pending migrations: ${pending.join(', ')}`);
      await ctx.backup(log);
    }
    return pending;
  });
}

/** Step 9: prisma migrate deploy from the new release. */
export function migrate(ctx: OpContext, dir: string, databaseUrl: string, log: EventLog): Promise<void> {
  return step(log, 'Migrate', () =>
    run(ctx, log, ctx.config.bin.pnpm, ['--filter', '@home/server', 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: dir,
      env: { DATABASE_URL: databaseUrl },
      timeoutMs: ctx.config.stepTimeoutsMs.migrate,
    }),
  );
}

/** Deletes a half-built release, never the one `current` points at. */
export function removeRelease(ctx: OpContext, sha: string, log: EventLog): void {
  if (isCurrent(ctx.paths, sha)) return;
  try {
    rmSync(releaseDir(ctx.paths, sha), { recursive: true, force: true });
  } catch (e) {
    log.line(`Couldn't remove ${short(sha)}: ${errorText(e)}`);
  }
}
