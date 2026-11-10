import type { Discovered } from "./types.js";

/** An identical sighting within this window is not written again (Tuya broadcasts every few seconds). */
const REWRITE_AFTER_MS = 60_000;

/** Remembers recently written sightings so repeats can be skipped. */
export class SightingThrottle {
  private readonly entries = new Map<string, { fingerprint: string; at: number }>();

  constructor(private readonly now: () => number) {}

  isRepeat(d: Discovered): boolean {
    const last = this.entries.get(key(d));
    return !!last && last.fingerprint === JSON.stringify(d) && this.now() - last.at < REWRITE_AFTER_MS;
  }

  /** Call only after the sighting was written, so a failed write is retried on the next sighting. */
  markWritten(d: Discovered): void {
    this.entries.set(key(d), { fingerprint: JSON.stringify(d), at: this.now() });
  }

  clear(): void {
    this.entries.clear();
  }
}

const key = (d: Discovered) => `${d.brand}:${d.externalId}`;
