import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckState, Commit } from '../src/github.js';
import { findPick } from '../src/poll.js';
import { type Fixture, OLD, setup } from './op-fixture.js';

const sha = (n: number) => `${n}`.repeat(40).slice(0, 40);
const at = (minutesAgo: number) => new Date(Date.parse('2026-11-10T09:00:00Z') - minutesAgo * 60_000).toISOString();

/** Newest first: c(1) is the head. */
const c = (n: number, minutesAgo = 60): Commit => ({ sha: sha(n), message: `m${n}`, committedAt: at(minutesAgo) });

function source(commits: Commit[], states: Record<string, CheckState>) {
  const asked: string[] = [];
  return {
    asked,
    gh: {
      head: async () => commits[0]!,
      commitsSince: async () => commits,
      treeSha: async () => undefined,
      latestAndroidRelease: async () => undefined,
      downloadAsset: async () => Buffer.alloc(0),
      checkState: async (s: string) => {
        asked.push(s);
        return states[s] ?? 'none';
      },
    },
  };
}

let f: Fixture;
beforeEach(() => {
  f = setup();
});
afterEach(() => f.cleanup());

const opts = { failed: [] as string[], ciTimeoutMs: 1_800_000, includeRunning: false };

describe('findPick', () => {
  it('stops asking GitHub at the newest green commit', async () => {
    const commits = [c(1), c(2), c(3), c(4), c(5)];
    const { gh, asked } = source(commits, { [sha(1)]: 'failure', [sha(2)]: 'success', [sha(3)]: 'success' });
    const pick = await findPick(f.ctx, gh, commits[0]!, OLD, opts);
    expect(pick).toMatchObject({ action: 'deploy', commit: { sha: sha(2) } });
    expect(pick.skip).toEqual([{ commit: commits[0], reason: 'tests failed' }]);
    expect(asked).toEqual([sha(1), sha(2)]);
  });

  it('stops at a head still inside the CI wait', async () => {
    const commits = [c(1, 5), c(2), c(3)];
    const { gh, asked } = source(commits, { [sha(1)]: 'pending', [sha(2)]: 'success' });
    const pick = await findPick(f.ctx, gh, commits[0]!, OLD, opts);
    expect(pick.action).toBe('wait');
    expect(asked).toEqual([sha(1)]);
  });

  it('with no CI wait (Deploy now) passes pending commits and stops at the first green one', async () => {
    const commits = [c(1, 5), c(2), c(3)];
    const { gh, asked } = source(commits, { [sha(1)]: 'pending', [sha(2)]: 'success' });
    const pick = await findPick(f.ctx, gh, commits[0]!, OLD, { ...opts, ciTimeoutMs: 0 });
    expect(pick).toMatchObject({ action: 'deploy', commit: { sha: sha(2) } });
    expect(asked).toEqual([sha(1), sha(2)]);
  });

  it('never asks about failed commits, and asks about every other one when none is green', async () => {
    const commits = [c(1), c(2), c(3)];
    const { gh, asked } = source(commits, { [sha(1)]: 'failure', [sha(3)]: 'failure' });
    const pick = await findPick(f.ctx, gh, commits[0]!, OLD, { ...opts, failed: [sha(2)] });
    expect(pick.action).toBe('none');
    expect(pick.skip.map((s) => s.commit.sha)).toEqual([sha(1), sha(3)]);
    expect(asked).toEqual([sha(1), sha(3)]);
  });
});
