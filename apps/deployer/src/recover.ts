import { existsSync } from 'node:fs';
import { forgetServiceSettings, savedSettingsFile } from './first-deploy-service.js';
import { openLog } from './op-context.js';
import type { OpContext } from './op-context.js';
import { currentTarget } from './releases.js';

export const INTERRUPTED = 'helper stopped during this';

/** On helper start: close events a crash left RUNNING, and start the app if it was left stopped. */
export async function recoverOnStart(ctx: OpContext): Promise<void> {
  const { history } = ctx;
  for (const ev of history.events().filter((e) => e.status === 'RUNNING')) {
    try {
      openLog(ctx, ev.id).log.line(`✖ ${INTERRUPTED}`);
    } catch {
      // the event is closed below either way
    }
    history.finish(ev.id, 'FAILED', INTERRUPTED);
    const failedShas = history.state().failedShas;
    if (ev.kind === 'DEPLOY' && ev.sha && !failedShas.includes(ev.sha)) {
      history.update({ failedShas: [...failedShas, ev.sha] }); // every failed deploy is never auto-retried
    }
  }
  if (currentTarget(ctx.paths) === undefined) {
    // No `current` yet: only a first deploy cut short before its switch stops the old install. Its settings
    // are still the old install's, so starting the service is enough.
    if (!existsSync(savedSettingsFile(ctx.paths))) return;
  } else {
    forgetServiceSettings(ctx.paths); // `current` exists, so the saved old-install settings must never be restored
  }
  const name = ctx.config.serviceName;
  try {
    if ((await ctx.sys.serviceStatus(name)) === 'stopped') await ctx.sys.serviceStart(name);
  } catch {
    // never keep the helper from starting; the status page shows the app is down
  }
}
