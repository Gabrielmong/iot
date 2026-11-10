import path from 'node:path';
import type { DeployerConfig } from './config.js';
import { spawnLines } from './spawn-lines.js';

export { needsShell, shellCommandLine } from './spawn-lines.js';

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  onLine?: (line: string) => void;
  timeoutMs?: number;
}

export type ServiceStatus = 'running' | 'stopped' | 'missing' | 'other';

export interface System {
  run(cmd: string, args: string[], opts?: RunOptions): Promise<void>;
  serviceStop(name: string): Promise<void>;
  serviceStart(name: string): Promise<void>;
  serviceRestart(name: string): Promise<void>;
  serviceStatus(name: string): Promise<ServiceStatus>;
  healthy(url: string, timeoutMs: number): Promise<boolean>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pure: interpret `nssm status` output (nssm may emit UTF-16, so NULs are ignored). */
export function parseNssmStatus(output: string): ServiceStatus {
  const text = output.replace(/\0/g, '');
  if (text.includes('does not exist')) return 'missing';
  if (text.includes('SERVICE_RUNNING')) return 'running';
  if (text.includes('SERVICE_STOPPED')) return 'stopped';
  return 'other'; // pending, paused or unrecognised: never treat as stopped
}

/** Polls until the service is stopped (or gone); running, pending and unknown states keep it waiting. */
export async function waitUntilStopped(
  status: () => Promise<ServiceStatus>,
  name: string,
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await status();
    if (s === 'stopped' || s === 'missing') return;
    await sleep(intervalMs);
  }
  throw new Error(`${name} did not stop within ${Math.round(timeoutMs / 1000)} s`);
}

/**
 * Idempotent stop: nothing to do when already stopped or gone; `nssm stop` only for a running
 * service (nssm fails on one that isn't started); then wait until it is really stopped.
 */
export async function stopService(
  status: () => Promise<ServiceStatus>,
  nssmStop: () => Promise<void>,
  name: string,
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<void> {
  const now = await status();
  if (now === 'stopped' || now === 'missing') return;
  if (now === 'running') await nssmStop();
  await waitUntilStopped(status, name, timeoutMs, intervalMs);
}

export function realSystem(bin: DeployerConfig['bin']): System {
  const run: System['run'] = async (cmd, args, opts) => {
    const code = await spawnLines(cmd, args, opts);
    if (code !== 0) throw new Error(`${path.basename(cmd)} exited ${code}`);
  };

  const serviceStatus: System['serviceStatus'] = async (name) => {
    let out = '';
    await spawnLines(bin.nssm, ['status', name], { onLine: (l) => (out += `${l}\n`) });
    return parseNssmStatus(out);
  };

  return {
    run,
    serviceStatus,
    serviceStart: (name) => run(bin.nssm, ['start', name]),
    serviceRestart: (name) => run(bin.nssm, ['restart', name]),
    serviceStop: (name) =>
      stopService(
        () => serviceStatus(name),
        () => run(bin.nssm, ['stop', name]),
        name,
      ),
    async healthy(url, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(Math.max(250, Math.min(5000, deadline - Date.now()))),
          });
          if (res.ok) return true;
        } catch {
          // not up yet
        }
        if (Date.now() + 1000 >= deadline) return false;
        await sleep(1000);
      }
    },
  };
}
