import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CiStore } from '../src/ci/ci-store.js';
import { CiWatcher } from '../src/ci/ci-watcher.js';
import { type ApiJob, type ApiRun, type Conditional, GitHubError } from '../src/github.js';
import { apiRun } from './ci-fixtures.js';

/** Answers queued per call; an empty queue answers "unchanged". Records the etags it was sent. */
class FakeActions {
  runAnswers: Array<Conditional<ApiRun[]> | Error> = [];
  jobAnswers = new Map<number, Array<Conditional<ApiJob[]>>>();
  runEtags: Array<string | undefined> = [];
  jobCalls: Array<{ id: number; etag?: string }> = [];
  private served = 0;

  async listPushRuns(_branch: string, etag?: string): Promise<Conditional<ApiRun[]>> {
    this.runEtags.push(etag);
    const next = this.runAnswers.shift() ?? { changed: false };
    if (next instanceof Error) throw next;
    return next;
  }

  async runJobs(id: number, etag?: string): Promise<Conditional<ApiJob[]>> {
    this.jobCalls.push({ id, etag });
    return this.jobAnswers.get(id)?.shift() ?? { changed: false };
  }

  runs(...runs: ApiRun[]): void {
    this.runAnswers.push({ changed: true, data: runs, etag: `"r${this.served++}"` });
  }

  jobs(id: number, ...jobs: ApiJob[]): void {
    const q = this.jobAnswers.get(id) ?? [];
    q.push({ changed: true, data: jobs, etag: `"j${id}"` });
    this.jobAnswers.set(id, q);
  }
}

const job = (id: number, status = 'completed', conclusion: string | null = 'success'): ApiJob => ({
  id,
  name: `job ${id}`,
  status,
  conclusion,
  started_at: null,
  completed_at: null,
  html_url: 'j',
  steps: [{ name: 'pnpm test', number: 1, status, conclusion, started_at: null, completed_at: null }],
});
const running = { status: 'in_progress', conclusion: null } as const;

let dir: string;
let gh: FakeActions;
let nudges: number;
let clock: Date;
let watcher: CiWatcher;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ci-watcher-'));
  gh = new FakeActions();
  nudges = 0;
  clock = new Date('2026-11-16T12:00:00Z');
  watcher = new CiWatcher({
    github: gh,
    store: new CiStore(join(dir, 'ci.json'), join(dir, 'ci-logs'), 50, () => clock),
    branch: 'main',
    gatingWorkflow: 'CI',
    idleMs: 20_000,
    activeMs: 5_000,
    now: () => clock,
    onGatingCompleted: () => (nudges += 1),
    errorText: (e) => (e instanceof Error ? e.message : String(e)),
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const runOf = (id: number) => watcher.view().commits.flatMap((c) => c.runs).find((r) => r.id === id);

describe('CiWatcher', () => {
  it('stores runs and jobs per commit', async () => {
    gh.runs(apiRun({ id: 1, ...running }), apiRun({ id: 2, name: 'Android', ...running }));
    gh.jobs(1, job(10, 'in_progress', null));
    gh.jobs(2, job(20, 'queued', null));
    await watcher.checkOnce();
    const [commit] = watcher.view().commits;
    expect(commit).toMatchObject({ sha: 'abc', message: 'Fix the thing' });
    expect(commit!.runs.map((r) => [r.workflow, r.gatesDeploy, r.state])).toEqual([
      ['CI', true, 'RUNNING'],
      ['Android', false, 'RUNNING'],
    ]);
    expect(runOf(1)!.jobs[0]).toMatchObject({ id: 10, state: 'RUNNING', steps: [{ name: 'pnpm test', state: 'RUNNING' }] });
    expect(runOf(2)!.jobs[0]).toMatchObject({ id: 20, state: 'QUEUED' });
    expect(watcher.view().lastCheckAt).toBe(clock.toISOString());
  });

  it('sends the last etag and does nothing more on 304', async () => {
    gh.runs(apiRun());
    gh.jobs(1, job(10));
    await watcher.checkOnce();
    const jobCalls = gh.jobCalls.length;
    await watcher.checkOnce();
    expect(gh.runEtags).toEqual([undefined, '"r0"']);
    expect(gh.jobCalls).toHaveLength(jobCalls);
  });

  it('fetches jobs while unfinished, once more when completed, then never', async () => {
    gh.runs(apiRun({ ...running }));
    gh.jobs(1, job(10, 'in_progress', null));
    await watcher.checkOnce();
    await watcher.checkOnce(); // run list unchanged; jobs asked again with their etag
    expect(gh.jobCalls).toEqual([
      { id: 1, etag: undefined },
      { id: 1, etag: '"j1"' },
    ]);
    gh.runs(apiRun());
    gh.jobs(1, job(10));
    await watcher.checkOnce();
    expect(runOf(1)).toMatchObject({ completed: true, jobsFinal: true });
    expect(runOf(1)!.jobs[0]!.state).toBe('SUCCEEDED');
    await watcher.checkOnce();
    expect(gh.jobCalls).toHaveLength(3);
  });

  it('a run first seen completed gets its jobs fetched once', async () => {
    gh.runs(apiRun());
    gh.jobs(1, job(10));
    await watcher.checkOnce();
    await watcher.checkOnce();
    expect(gh.jobCalls).toHaveLength(1);
    expect(runOf(1)!.jobsFinal).toBe(true);
  });

  it('nudges once when the gating run on the head completes; not for Android, not for an older sha, not on first sight', async () => {
    const older = { head_sha: 'old', head_commit: { message: 'old', timestamp: '2026-11-16T09:00:00Z' } };
    gh.runs(
      apiRun({ id: 1, ...running }),
      apiRun({ id: 2, name: 'Android', ...running }),
      apiRun({ id: 3, ...older, ...running }),
      apiRun({ id: 4, ...older }),
    );
    await watcher.checkOnce();
    expect(nudges).toBe(0); // run 4 is completed, but first seen that way
    gh.runs(apiRun({ id: 1, ...running }), apiRun({ id: 2, name: 'Android' }), apiRun({ id: 3, ...older }), apiRun({ id: 4, ...older }));
    await watcher.checkOnce();
    expect(nudges).toBe(0); // Android done; CI done on an older sha
    gh.runs(apiRun({ id: 1 }), apiRun({ id: 2, name: 'Android' }), apiRun({ id: 3, ...older }), apiRun({ id: 4, ...older }));
    await watcher.checkOnce();
    expect(nudges).toBe(1);
    gh.runs(apiRun({ id: 1, updated_at: 'later' }), apiRun({ id: 2, name: 'Android' }));
    await watcher.checkOnce();
    expect(nudges).toBe(1);
  });

  it('a re-run (same id, attempt 2, in_progress) becomes active again, replaces jobs, and nudges again when it completes', async () => {
    gh.runs(apiRun({ ...running }));
    gh.jobs(1, job(10, 'in_progress', null));
    await watcher.checkOnce();
    gh.runs(apiRun({ conclusion: 'failure' }));
    gh.jobs(1, job(10, 'completed', 'failure'));
    await watcher.checkOnce();
    expect(nudges).toBe(1);
    expect(watcher.nextDelayMs()).toBe(20_000);

    gh.runs(apiRun({ run_attempt: 2, ...running }));
    gh.jobs(1, job(11, 'in_progress', null));
    await watcher.checkOnce();
    expect(runOf(1)).toMatchObject({ attempt: 2, state: 'RUNNING', jobsFinal: false });
    expect(runOf(1)!.jobs.map((j) => j.id)).toEqual([11]);
    expect(watcher.nextDelayMs()).toBe(5_000);

    gh.runs(apiRun({ run_attempt: 2 }));
    gh.jobs(1, job(11));
    await watcher.checkOnce();
    expect(nudges).toBe(2);
    expect(runOf(1)!.state).toBe('SUCCEEDED');
  });

  it('nextDelayMs: active 5000 while a run is unfinished, idle 20000 otherwise', async () => {
    expect(watcher.nextDelayMs()).toBe(20_000);
    gh.runs(apiRun({ ...running }));
    await watcher.checkOnce();
    expect(watcher.nextDelayMs()).toBe(5_000);
    gh.runs(apiRun());
    gh.jobs(1, job(10));
    await watcher.checkOnce();
    expect(watcher.nextDelayMs()).toBe(20_000);
  });

  it('GitHub down: checkOnce resolves, keeps the stored data, sets view().error, idle delay', async () => {
    gh.runs(apiRun({ ...running }));
    await watcher.checkOnce();
    gh.runAnswers.push(new GitHubError("Can't reach GitHub"));
    await expect(watcher.checkOnce()).resolves.toBeUndefined();
    expect(watcher.view().error).toBe("Can't reach GitHub");
    expect(watcher.view().commits).toHaveLength(1);
    expect(watcher.nextDelayMs()).toBe(20_000);
    await watcher.checkOnce();
    expect(watcher.view().error).toBeUndefined();
  });

  it('rate limited: waits until resetAt', async () => {
    const resetAt = new Date(clock.getTime() + 600_000);
    gh.runAnswers.push(new GitHubError('GitHub rate limit reached; trying again later', 403, resetAt));
    await watcher.checkOnce();
    expect(watcher.nextDelayMs()).toBe(600_000);
    clock = new Date(resetAt.getTime() + 1);
    expect(watcher.nextDelayMs()).toBe(20_000);
  });
});
