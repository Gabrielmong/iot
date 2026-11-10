import type { LightState } from '../types.js';
import { RequestQueue } from '../request-queue.js';
import { GoveeTimeoutError } from './errors.js';

interface Slot {
  queue: RequestQueue;
  active: number;
  /** Set only while a request is awaiting its reply. */
  pending?: { resolve: (state: LightState) => void; reject: (err: Error) => void };
}

/**
 * Matches devStatus replies to requests by source IP. Replies carry no id, so requests to the same
 * IP are serialized, and replies that arrive while nothing is pending for that IP (for example a
 * late reply after a timeout) are dropped.
 */
export class StatusCorrelator {
  private readonly slots = new Map<string, Slot>();
  private epoch = 0;
  private abortError?: Error;

  constructor(private readonly timeoutMs: number) {}

  /** Runs `send`, then resolves with the next status reply from `ip`. */
  request(ip: string, send: () => Promise<void>): Promise<LightState> {
    let slot = this.slots.get(ip);
    if (!slot) {
      slot = { queue: new RequestQueue(), active: 0 };
      this.slots.set(ip, slot);
    }
    const mine = slot;
    const epoch = this.epoch;
    mine.active++;
    return mine.queue
      .run(() => (epoch === this.epoch ? this.exchange(ip, mine, send) : Promise.reject(this.abortError)))
      .finally(() => {
        if (--mine.active === 0) this.slots.delete(ip);
      });
  }

  /** Feeds a decoded reply; dropped when nothing is waiting on that IP. */
  deliver(ip: string, state: LightState): void {
    this.slots.get(ip)?.pending?.resolve(state);
  }

  /** Rejects every in-flight and queued request with `err`; later requests are unaffected. */
  rejectAll(err: Error): void {
    this.epoch++;
    this.abortError = err;
    for (const slot of this.slots.values()) slot.pending?.reject(err);
  }

  private exchange(ip: string, slot: Slot, send: () => Promise<void>): Promise<LightState> {
    return new Promise<LightState>((resolve, reject) => {
      const done = (fn: () => void): void => {
        clearTimeout(timer);
        slot.pending = undefined;
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new GoveeTimeoutError(ip, this.timeoutMs))), this.timeoutMs);
      slot.pending = { resolve: (s) => done(() => resolve(s)), reject: (e) => done(() => reject(e)) };
      send().catch((err: unknown) => done(() => reject(err)));
    });
  }
}
