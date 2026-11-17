import { type GitHub, GitHubError } from '../github.js';
import { commitOf, toJob, toRun } from './ci-map.js';
import type { CiStore } from './ci-store.js';
import type { CiView } from './types.js';

export interface CiWatcherDeps {
  github: Pick<GitHub, 'listPushRuns' | 'runJobs'>;
  store: CiStore;
  branch: string;
  gatingWorkflow: string;
  idleMs: number;
  activeMs: number;
  now: () => Date;
  /** The gating workflow just finished on the branch head: the deploy loop may check now. */
  onGatingCompleted: () => void;
  errorText: (e: unknown) => string;
}

/**
 * Follows GitHub Actions on the deploy branch for the Deploys page. ETag'd requests make the idle
 * check nearly free; while a run is unfinished it polls faster and fetches jobs and steps. It only
 * reports: deploy decisions stay with the deploy loop (the nudge just asks it to check sooner).
 */
export class CiWatcher {
  private listEtag?: string;
  private readonly jobEtags = new Map<number, string>();
  /** Run ids in the last run list. */
  private listed = new Set<number>();
  private error?: string;
  private lastCheckAt?: string;
  private pausedUntil?: Date;
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopped = true;

  constructor(private readonly deps: CiWatcherDeps) {}

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.checkOnce().finally(() => {
        this.inFlight = undefined;
        if (!this.stopped) this.schedule(this.nextDelayMs());
      });
    }, ms);
  }

  /** One pass. Never rejects: a failure keeps the last data and is shown as `error`. */
  async checkOnce(): Promise<void> {
    const { now } = this.deps;
    try {
      const nudge = await this.readRuns();
      await this.readJobs();
      this.lastCheckAt = now().toISOString();
      this.error = undefined;
      this.pausedUntil = undefined;
      if (nudge) this.deps.onGatingCompleted();
    } catch (e) {
      this.error = this.deps.errorText(e);
      if (e instanceof GitHubError && e.resetAt) this.pausedUntil = e.resetAt;
    }
  }

  /** Updates the stored runs; true when the gating workflow just completed on the head. */
  private async readRuns(): Promise<boolean> {
    const { github, store, branch, gatingWorkflow } = this.deps;
    const list = await github.listPushRuns(branch, this.listEtag);
    if (!list.changed) return false;
    this.listEtag = list.etag;
    this.listed = new Set();
    const head = list.data[0]?.head_sha;
    let nudge = false;
    for (const api of list.data) {
      const before = store.run(api.id);
      const prev = before && { completed: before.completed, attempt: before.attempt };
      const run = toRun(api, gatingWorkflow);
      if (prev && prev.attempt !== run.attempt) this.jobEtags.delete(run.id);
      store.upsertRun(commitOf(api), run);
      this.listed.add(run.id);
      const justFinished = prev !== undefined && (!prev.completed || prev.attempt !== run.attempt);
      if (run.gatesDeploy && run.completed && api.head_sha === head && justFinished) nudge = true;
    }
    return nudge;
  }

  /** Jobs and steps of each listed run whose jobs may still change. */
  private async readJobs(): Promise<void> {
    const { github, store } = this.deps;
    for (const id of this.listed) {
      const run = store.run(id);
      if (!run || run.jobsFinal) continue;
      const jobs = await github.runJobs(id, this.jobEtags.get(id));
      if (jobs.changed) {
        if (jobs.etag) this.jobEtags.set(id, jobs.etag);
        store.setJobs(id, jobs.data.map(toJob), run.completed);
      } else if (run.completed) {
        store.setJobs(id, run.jobs, true); // unchanged since the run finished: what we hold is final
      }
    }
  }

  nextDelayMs(): number {
    const { idleMs, activeMs, now, store } = this.deps;
    if (this.pausedUntil && this.pausedUntil > now()) {
      return Math.max(idleMs, this.pausedUntil.getTime() - now().getTime());
    }
    if (this.error) return idleMs;
    const active = [...this.listed].some((id) => {
      const run = store.run(id);
      return run !== undefined && (!run.completed || !run.jobsFinal);
    });
    return active ? activeMs : idleMs;
  }

  view(): CiView {
    return {
      commits: this.deps.store.commits(),
      ...(this.error ? { error: this.error } : {}),
      ...(this.lastCheckAt ? { lastCheckAt: this.lastCheckAt } : {}),
    };
  }
}
