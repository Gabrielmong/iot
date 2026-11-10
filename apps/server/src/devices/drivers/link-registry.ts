export interface Link {
  stop(): void;
}

/**
 * A driver's live connections, keyed by device (or device group). `sync` keeps links whose
 * fingerprint (connection-relevant fields) is unchanged, recreates changed ones and stops the rest.
 */
export class LinkRegistry<L extends Link> {
  private readonly entries = new Map<string, { fingerprint: string; link: L }>();

  /** `create` may return undefined when the item cannot be connected (it is retried on the next sync). */
  sync<T>(items: T[], keyOf: (item: T) => string, fingerprintOf: (item: T) => string, create: (item: T) => L | undefined): void {
    const keys = new Set<string>();
    for (const item of items) {
      const key = keyOf(item);
      const fingerprint = fingerprintOf(item);
      keys.add(key);
      const existing = this.entries.get(key);
      if (existing?.fingerprint === fingerprint) continue;
      existing?.link.stop();
      this.entries.delete(key);
      const link = create(item);
      if (link) this.entries.set(key, { fingerprint, link });
    }
    for (const [key, entry] of this.entries) {
      if (keys.has(key)) continue;
      entry.link.stop();
      this.entries.delete(key);
    }
  }

  get(key: string): L | undefined {
    return this.entries.get(key)?.link;
  }

  links(): L[] {
    return [...this.entries.values()].map((e) => e.link);
  }

  stopAll(): void {
    for (const entry of this.entries.values()) entry.link.stop();
    this.entries.clear();
  }
}
