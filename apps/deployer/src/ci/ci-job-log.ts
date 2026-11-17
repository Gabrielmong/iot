import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { GitHub } from '../github.js';
import { tailLines } from '../history.js';
import type { CiStore } from './ci-store.js';

const JOB_ID = /^\d{1,20}$/;
const MAX_LINES = 2000;

/**
 * A finished job's log (its last 2,000 lines), fetched from GitHub once and then served from the
 * cache. Undefined for an id that isn't a known, finished job, or when GitHub no longer has the log.
 */
export async function readJobLog(o: { id: string; store: CiStore; github: Pick<GitHub, 'jobLog'> }): Promise<string | undefined> {
  if (!JOB_ID.test(o.id)) return undefined;
  const id = Number(o.id);
  const job = o.store
    .commits()
    .flatMap((c) => c.runs.flatMap((r) => r.jobs))
    .find((j) => j.id === id);
  if (!job || job.state === 'QUEUED' || job.state === 'RUNNING') return undefined;
  const file = o.store.logFile(id);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const text = await o.github.jobLog(id);
  if (text === undefined) return undefined;
  const log = tailLines(text, MAX_LINES);
  writeFileSync(file, log);
  return log;
}
