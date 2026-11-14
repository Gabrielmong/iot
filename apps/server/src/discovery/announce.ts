import { createBonjour, type BonjourLike } from "./bonjour.js";

export type { BonjourLike } from "./bonjour.js";

export interface AnnounceOptions {
  port: number;
  name: string;
  /** The LAN address the server binds to; mDNS uses that interface and advertises it as TXT `addr`. */
  host?: string;
  log: { info(msg: string): void; warn(msg: string): void };
  create?: (host?: string) => BonjourLike;
  /** How long stop() waits for the goodbye packets before giving up. */
  stopTimeoutMs?: number;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function destroyQuietly(bonjour: BonjourLike | undefined): void {
  try {
    bonjour?.destroy();
  } catch {
    // nothing to release
  }
}

/** Resolves when `unpublishAll` calls back, or after `ms`, whichever is first. */
function unpublishWithin(bonjour: BonjourLike, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    try {
      bonjour.unpublishAll(() => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** Announces `_home-control._tcp` so the Android app can find the server. Never throws: discovery is optional. */
export function startAnnouncement(opts: AnnounceOptions): { stop(): Promise<void> } {
  const { port, name, host, log, create = createBonjour, stopTimeoutMs = 1000 } = opts;
  let bonjour: BonjourLike | undefined;
  let failed = false;
  const fail = (err: unknown) => {
    if (failed) return;
    failed = true;
    log.warn(`mDNS announcement unavailable: ${message(err)}`);
    destroyQuietly(bonjour);
  };
  try {
    bonjour = create(host);
    bonjour.onError(fail);
    log.info(`Starting mDNS announcement of "${name}" (_home-control._tcp, port ${port})`);
    bonjour.publish(
      { name, type: "home-control", protocol: "tcp", port, ...(host ? { txt: { addr: host } } : {}) },
      () => log.info(`Announcing "${name}" over mDNS`),
    );
  } catch (err) {
    fail(err);
  }
  return {
    stop: async () => {
      if (failed || !bonjour) return;
      const active = bonjour;
      await unpublishWithin(active, stopTimeoutMs);
      destroyQuietly(active);
    },
  };
}
