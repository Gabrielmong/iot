import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readStored, writeStored } from '../history-file.js';
import type { CiCommit, CiJob, CiRun } from './types.js';

interface Stored {
  commits: CiCommit[];
}

type CommitInfo = Pick<CiCommit, 'sha' | 'message' | 'committedAt'>;

const newestFirst = (a: CiCommit, b: CiCommit) =>
  Date.parse(b.committedAt) - Date.parse(a.committedAt) || Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt);

/** ci.json: workflow runs per commit, the newest `keep` commits. Cached job logs live in `logsDir`. */
export class CiStore {
  private data: Stored;

  constructor(
    private readonly file: string,
    private readonly logsDir: string,
    private readonly keep: number,
    private readonly now: () => Date,
  ) {
    mkdirSync(dirname(file), { recursive: true });
    mkdirSync(logsDir, { recursive: true });
    this.data = { commits: readStored<Partial<Stored>>(file, now())?.commits ?? [] };
  }

  /** Newest commit first. */
  commits(): CiCommit[] {
    return this.data.commits;
  }

  run(id: number): CiRun | undefined {
    for (const c of this.data.commits) {
      const r = c.runs.find((x) => x.id === id);
      if (r) return r;
    }
    return undefined;
  }

  logFile(jobId: number): string {
    return join(this.logsDir, `${jobId}.log`);
  }

  /** Adds or updates a run. A new attempt (a re-run) drops the old attempt's jobs and their cached logs. */
  upsertRun(commit: CommitInfo, run: Omit<CiRun, 'jobs' | 'jobsFinal'>): void {
    const record = this.commitRecord(commit);
    const existing = record.runs.find((r) => r.id === run.id);
    if (!existing) {
      record.runs.push({ ...run, jobs: [], jobsFinal: false });
    } else if (existing.attempt !== run.attempt) {
      this.dropLogs(existing.jobs);
      Object.assign(existing, run, { jobs: [], jobsFinal: false });
    } else {
      Object.assign(existing, run);
    }
    this.data.commits.sort(newestFirst);
    this.prune();
    this.save();
  }

  setJobs(runId: number, jobs: CiJob[], final: boolean): void {
    const run = this.run(runId);
    if (!run) return;
    run.jobs = jobs;
    run.jobsFinal = final;
    this.save();
  }

  private commitRecord(commit: CommitInfo): CiCommit {
    let record = this.data.commits.find((c) => c.sha === commit.sha);
    if (!record) {
      record = { ...commit, firstSeenAt: this.now().toISOString(), runs: [] };
      this.data.commits.push(record);
    }
    return record;
  }

  private prune(): void {
    for (const gone of this.data.commits.slice(this.keep)) {
      for (const r of gone.runs) this.dropLogs(r.jobs);
    }
    this.data.commits = this.data.commits.slice(0, this.keep);
  }

  private dropLogs(jobs: CiJob[]): void {
    for (const j of jobs) rmSync(this.logFile(j.id), { force: true });
  }

  private save(): void {
    writeStored(this.file, this.data);
  }
}
