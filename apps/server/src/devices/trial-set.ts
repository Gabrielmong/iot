import type { Brand } from "./types.js";

/** A trial ends after this long without being started, switched or renewed. */
export const TRIAL_IDLE_MS = 120_000;

type Trial = { brand: Brand; lastUsed: number };

/**
 * Un-adopted devices the admin is testing (switching on/off to identify them). Held only in memory;
 * each trial expires after `TRIAL_IDLE_MS` without use.
 */
export class TrialSet {
  private readonly trials = new Map<string, Trial>();

  /** Starts or renews a trial. */
  touch(id: string, brand: Brand, now: Date): void {
    this.trials.set(id, { brand, lastUsed: now.getTime() });
  }

  remove(id: string): void {
    this.trials.delete(id);
  }

  has(id: string): boolean {
    return this.trials.has(id);
  }

  ids(brand: Brand): string[] {
    return [...this.trials].filter(([, t]) => t.brand === brand).map(([id]) => id);
  }

  /** Trials unused for `TRIAL_IDLE_MS` or longer. */
  expired(now: Date): string[] {
    return [...this.trials].filter(([, t]) => now.getTime() - t.lastUsed >= TRIAL_IDLE_MS).map(([id]) => id);
  }
}
