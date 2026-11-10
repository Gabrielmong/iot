import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { EventLog } from './event-log.js';
import type { System } from './system.js';

export interface BackupOptions {
  pgDump: string;
  databaseUrl: string;
  dir: string;
  keep: number;
  now: Date;
  log: EventLog;
  timeoutMs?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function prune(dir: string, keep: number): void {
  const dumps = readdirSync(dir)
    .filter((f) => /^home-.*\.dump$/.test(f))
    .sort();
  for (const f of dumps.slice(0, Math.max(0, dumps.length - keep))) rmSync(path.join(dir, f));
}

/** Dumps the database to `dir`, keeping the newest `keep` dumps. Returns the file path. The caller opens the log section. */
export async function backupDatabase(sys: Pick<System, 'run'>, opts: BackupOptions): Promise<string> {
  const { pgDump, databaseUrl, dir, keep, now, log, timeoutMs } = opts;
  mkdirSync(dir, { recursive: true });
  const name = `home-${stamp(now)}.dump`;
  const file = path.join(dir, name);
  const url = new URL(databaseUrl);
  const password = decodeURIComponent(url.password);
  url.password = '';
  await sys.run(pgDump, ['--format=custom', '--file', file, '--dbname', url.toString()], {
    env: { PGPASSWORD: password },
    timeoutMs,
  });
  log.line(`Backup written: ${name}`);
  prune(dir, keep);
  return file;
}
