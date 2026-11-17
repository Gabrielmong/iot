import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CiStore } from '../src/ci/ci-store.js';
import type { CiJob, CiRun } from '../src/ci/types.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ci-store-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const now = () => new Date('2026-11-16T12:00:00Z');
const store = (keep = 50) => new CiStore(join(dir, 'ci.json'), join(dir, 'ci-logs'), keep, now);
const commit = (sha: string, committedAt = '2026-11-16T10:00:00Z') => ({ sha, message: `m ${sha}`, committedAt });
const run = (o: Partial<Omit<CiRun, 'jobs' | 'jobsFinal'>> = {}): Omit<CiRun, 'jobs' | 'jobsFinal'> => ({
  id: 1,
  attempt: 1,
  workflow: 'CI',
  gatesDeploy: true,
  state: 'RUNNING',
  completed: false,
  createdAt: 'c',
  updatedAt: 'u',
  url: 'url',
  ...o,
});
const job = (id: number): CiJob => ({ id, name: `job ${id}`, state: 'SUCCEEDED', url: 'j', steps: [] });

describe('CiStore', () => {
  it('persists across instances', () => {
    const a = store();
    a.upsertRun(commit('abc'), run());
    a.setJobs(1, [job(7)], true);
    const b = store();
    expect(b.commits()).toEqual([
      { sha: 'abc', message: 'm abc', committedAt: '2026-11-16T10:00:00Z', firstSeenAt: now().toISOString(), runs: [{ ...run(), jobs: [job(7)], jobsFinal: true }] },
    ]);
    expect(b.run(1)?.jobs).toEqual([job(7)]);
  });

  it("a new attempt clears jobs, resets jobsFinal and deletes the old jobs' cached logs", () => {
    const s = store();
    s.upsertRun(commit('abc'), run({ completed: true, state: 'FAILED' }));
    s.setJobs(1, [job(7)], true);
    writeFileSync(s.logFile(7), 'old log');
    s.upsertRun(commit('abc'), run({ attempt: 2 }));
    expect(s.run(1)).toMatchObject({ attempt: 2, jobs: [], jobsFinal: false, state: 'RUNNING' });
    expect(existsSync(s.logFile(7))).toBe(false);
  });

  it('same attempt keeps jobs and updates the run', () => {
    const s = store();
    s.upsertRun(commit('abc'), run());
    s.setJobs(1, [job(7)], false);
    s.upsertRun(commit('abc'), run({ state: 'SUCCEEDED', completed: true }));
    expect(s.run(1)).toMatchObject({ state: 'SUCCEEDED', completed: true, jobs: [job(7)], jobsFinal: false });
  });

  it('two workflows on one commit share its record', () => {
    const s = store();
    s.upsertRun(commit('abc'), run());
    s.upsertRun(commit('abc'), run({ id: 2, workflow: 'Android', gatesDeploy: false }));
    expect(s.commits()).toHaveLength(1);
    expect(s.commits()[0]!.runs.map((r) => r.id)).toEqual([1, 2]);
  });

  it('prunes to keep commits by committedAt and deletes their job logs', () => {
    const s = store(2);
    s.upsertRun(commit('old', '2026-11-16T08:00:00Z'), run({ id: 1 }));
    s.setJobs(1, [job(7)], true);
    writeFileSync(s.logFile(7), 'log');
    s.upsertRun(commit('mid', '2026-11-16T09:00:00Z'), run({ id: 2 }));
    s.upsertRun(commit('new', '2026-11-16T10:00:00Z'), run({ id: 3 }));
    expect(s.commits().map((c) => c.sha)).toEqual(['new', 'mid']);
    expect(s.run(1)).toBeUndefined();
    expect(existsSync(s.logFile(7))).toBe(false);
  });

  it('a corrupt file starts empty', () => {
    writeFileSync(join(dir, 'ci.json'), '{ not json');
    expect(store().commits()).toEqual([]);
  });
});
