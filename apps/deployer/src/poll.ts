import type { CheckState, Commit, GitHub } from './github.js';
import { GitHubError } from './github.js';
import { type OpContext, errorText } from './op-context.js';
import { type Pick as CommitPick, type SkipNote, pickCommit } from './pick-commit.js';
import { makeRedactor } from './redact.js';

export type CommitSource = Pick<
  GitHub,
  'head' | 'commitsSince' | 'checkState' | 'treeSha' | 'latestAndroidRelease' | 'downloadAsset'
>;

const MAX_SKIPPED = 200;

export interface PickOptions {
  failed: string[];
  ciTimeoutMs: number;
  /** Deploy now: offer the head even when it is the running commit, so it can say "Already running". */
  includeRunning: boolean;
}

async function candidates(gh: CommitSource, head: Commit, runningSha: string | undefined, includeRunning: boolean) {
  if (runningSha === undefined) return [head];
  if (runningSha === head.sha) return includeRunning ? [head] : [];
  return gh.commitsSince(runningSha, head.sha);
}

/**
 * Commits after the running one, newest first, through pickCommit. Check states are fetched one
 * at a time and only until pickCommit has its answer (a green commit, or one to wait for), so a
 * long run of commits doesn't cost a GitHub call each. Failed commits are never looked up.
 */
export async function findPick(
  ctx: OpContext,
  gh: CommitSource,
  head: Commit,
  runningSha: string | undefined,
  opts: PickOptions,
): Promise<CommitPick> {
  const commits = await candidates(gh, head, runningSha, opts.includeRunning);
  const states: Record<string, CheckState> = {};
  const now = ctx.now();
  const pick = (upTo: number) =>
    pickCommit({ commits: commits.slice(0, upTo), states, failed: opts.failed, now, ciTimeoutMs: opts.ciTimeoutMs });
  for (const [i, c] of commits.entries()) {
    if (opts.failed.includes(c.sha)) continue;
    states[c.sha] = await gh.checkState(c.sha);
    const answer = pick(i + 1);
    if (answer.action !== 'none') return answer;
  }
  return pick(commits.length);
}

/** A SKIPPED event per commit, once each (remembered in state.skippedShas). */
export function recordSkips(ctx: OpContext, skip: SkipNote[]): void {
  const { history } = ctx;
  for (const { commit, reason } of skip) {
    const skipped = history.state().skippedShas;
    if (skipped.includes(commit.sha)) continue;
    history.record({ kind: 'DEPLOY', status: 'SKIPPED', sha: commit.sha, message: commit.message, by: 'auto', detail: reason });
    history.update({ skippedShas: [...skipped, commit.sha].slice(-MAX_SKIPPED) });
  }
}

/** What lastCheck.error shows: GitHub's own message, anything else redacted. */
export function checkError(ctx: OpContext, e: unknown): string {
  if (e instanceof GitHubError) return e.message;
  let secrets: string[] = [];
  try {
    secrets = ctx.secrets();
  } catch {
    // the built-in patterns still apply
  }
  return makeRedactor(secrets)(`Check failed: ${errorText(e)}`);
}
