import type { EventLog } from './event-log.js';
import { loadServiceSettings, writeServiceSettings } from './first-deploy-service.js';
import type { OpContext } from './op-context.js';
import { step } from './op-steps.js';
import { removeCurrent } from './releases.js';
import { checkHealth, ensureStarted } from './switch-to.js';

/** How a failed first deploy's detail ends. */
export const RESTORE_TEXT = {
  restored: 'restored the previous install',
  failed: 'restoring the previous install also failed',
  'nothing saved': 'there is no previous install to go back to',
} as const;

export type RestoreResult = keyof typeof RESTORE_TEXT;

/**
 * A first deploy failed before any migration: put HomeControl back on the install it ran before
 * (the settings saved in first-deploy-service.json), drop `current`, start it and check health.
 * `stopFirst` is false when the app never got past the stop step.
 */
export async function restoreInstall(ctx: OpContext, log: EventLog, stopFirst: boolean): Promise<RestoreResult> {
  const saved = loadServiceSettings(ctx.paths);
  if (!saved) {
    await ensureStarted(ctx, log);
    return 'nothing saved';
  }
  const name = ctx.config.serviceName;
  try {
    if (stopFirst) await step(log, 'Stop app', () => ctx.sys.serviceStop(name));
    await step(log, 'Restore previous install', async () => {
      await writeServiceSettings(ctx, saved);
      removeCurrent(ctx.paths);
    });
    if ((await ctx.sys.serviceStatus(name)) !== 'running') await step(log, 'Start app', () => ctx.sys.serviceStart(name));
  } catch {
    await ensureStarted(ctx, log);
    return 'failed';
  }
  if (!(await checkHealth(ctx, log))) return 'failed';
  log.line('Restored the previous install');
  return 'restored';
}
