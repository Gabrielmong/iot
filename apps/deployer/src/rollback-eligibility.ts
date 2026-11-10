import type { DeployEvent } from './history.js';
import type { OpContext } from './op-context.js';
import { OpError } from './op-error.js';
import { assertCanRollback } from './rollback.js';

export type MarkedEvent = DeployEvent & { canRollback: boolean; rollbackBlockedReason?: string };

interface Verdict {
  can: boolean;
  reason?: string;
}

const APPLIED_TTL_MS = 10_000;

const restorable = (e: DeployEvent) =>
  e.sha !== undefined && e.status === 'SUCCEEDED' && (e.kind === 'DEPLOY' || e.kind === 'ROLLBACK');

/** Which kept releases a rollback could go to, using the same check as the command (applied migrations cached 10 s). */
export class RollbackEligibility {
  private cache?: { at: number; applied: Promise<string[]> };
  private readonly cached: OpContext;

  constructor(private readonly ctx: OpContext) {
    this.cached = { ...ctx, migrations: { applied: () => this.applied() } };
  }

  private applied(): Promise<string[]> {
    const now = this.ctx.now().getTime();
    if (!this.cache || now - this.cache.at >= APPLIED_TTL_MS) {
      const applied = this.ctx.migrations.applied();
      this.cache = { at: now, applied };
      applied.catch(() => {
        if (this.cache?.applied === applied) this.cache = undefined; // don't keep a failure
      });
    }
    return this.cache.applied;
  }

  private async verdicts(runningSha: string | undefined): Promise<Map<string, Verdict>> {
    const state = this.ctx.history.state();
    const out = new Map<string, Verdict>();
    for (const sha of state.releases) {
      if (sha === runningSha || sha === state.running?.sha) continue;
      try {
        await assertCanRollback(this.cached, sha);
        out.set(sha, { can: true });
      } catch (e) {
        // 404: the release folder is gone, so there is nothing to offer; 400: blocked, say why.
        if (e instanceof OpError && e.status === 400) out.set(sha, { can: false, reason: e.message });
      }
    }
    return out;
  }

  /** Marks the newest successful event of each kept release; every other event can't be rolled back to. */
  async mark(events: DeployEvent[], runningSha: string | undefined): Promise<MarkedEvent[]> {
    const verdicts = await this.verdicts(runningSha);
    const seen = new Set<string>();
    return events.map((ev) => {
      const verdict = restorable(ev) && !seen.has(ev.sha!) ? verdicts.get(ev.sha!) : undefined;
      if (!verdict) return { ...ev, canRollback: false };
      seen.add(ev.sha!);
      return { ...ev, canRollback: verdict.can, ...(verdict.reason ? { rollbackBlockedReason: verdict.reason } : {}) };
    });
  }
}
