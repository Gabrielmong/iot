import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readJobLog } from '../src/ci/ci-job-log.js';
import { CiStore } from '../src/ci/ci-store.js';
import type { CiJob } from '../src/ci/types.js';

let dir: string;
let store: CiStore;
let fetched: number[];
let answer: string | undefined;
const github = {
  async jobLog(id: number) {
    fetched.push(id);
    return answer;
  },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ci-job-log-'));
  store = new CiStore(join(dir, 'ci.json'), join(dir, 'ci-logs'), 50, () => new Date('2026-11-16T12:00:00Z'));
  fetched = [];
  answer = 'line\n';
  store.upsertRun(
    { sha: 'abc', message: 'm', committedAt: '2026-11-16T10:00:00Z' },
    { id: 1, attempt: 1, workflow: 'CI', gatesDeploy: true, state: 'RUNNING', completed: false, createdAt: 'c', updatedAt: 'u', url: 'r' },
  );
  const job = (id: number, state: CiJob['state']): CiJob => ({ id, name: `j${id}`, state, url: 'j', steps: [] });
  store.setJobs(1, [job(5, 'FAILED'), job(6, 'RUNNING')], false);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (id: string) => readJobLog({ id, store, github });

describe('readJobLog', () => {
  it('rejects a non-numeric id', async () => {
    expect(await read('../x')).toBeUndefined();
    expect(await read('5a')).toBeUndefined();
    expect(fetched).toEqual([]);
  });

  it('unknown or unfinished job → undefined', async () => {
    expect(await read('99')).toBeUndefined();
    expect(await read('6')).toBeUndefined();
    expect(fetched).toEqual([]);
  });

  it('fetches once, caches, tails to 2000 lines', async () => {
    answer = Array.from({ length: 2500 }, (_, i) => `l${i}`).join('\n') + '\n';
    const first = await read('5');
    expect(first!.split('\n')).toHaveLength(2001);
    expect(first!.startsWith('l500\n')).toBe(true);
    answer = 'changed';
    expect(await read('5')).toBe(first);
    expect(fetched).toEqual([5]);
  });

  it('expired log (jobLog undefined) → undefined', async () => {
    answer = undefined;
    expect(await read('5')).toBeUndefined();
  });
});
