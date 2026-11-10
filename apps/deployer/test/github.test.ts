import { describe, expect, it } from 'vitest';
import { GitHub, GitHubError } from '../src/github.js';

type Call = { url: string; init?: RequestInit };

function fake(handler: (url: string) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const { status = 200, body = {} } = handler(u);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const runs = (...r: Array<{ status: string; conclusion: string | null }>) => ({ body: { check_runs: r } });
const done = (conclusion: string) => ({ status: 'completed', conclusion });

describe('GitHub.checkState', () => {
  async function state(r: ReturnType<typeof runs>) {
    const { impl } = fake(() => r);
    return new GitHub('o/r', 'tok', impl).checkState('abc');
  }

  it('maps check runs', async () => {
    expect(await state(runs())).toBe('none');
    expect(await state(runs(done('success'), { status: 'in_progress', conclusion: null }))).toBe('pending');
    expect(await state(runs(done('success'), done('failure')))).toBe('failure');
    expect(await state(runs(done('success'), done('skipped'), done('neutral')))).toBe('success');
  });

  it('requests per_page=100', async () => {
    const { impl, calls } = fake(() => runs());
    await new GitHub('o/r', 'tok', impl).checkState('abc');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/commits/abc/check-runs?per_page=100');
  });
});

describe('GitHub requests', () => {
  it('sends the token as bearer', async () => {
    const { impl, calls } = fake(() => ({
      body: { sha: 's', commit: { message: 'hi\nbody', committer: { date: '2026-01-01T00:00:00Z' } } },
    }));
    const c = await new GitHub('o/r', 'secret', impl).head('main');
    expect(c).toEqual({ sha: 's', message: 'hi', committedAt: '2026-01-01T00:00:00Z' });
    const h = calls[0].init?.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer secret');
    expect(h.Accept).toBe('application/vnd.github+json');
    expect(h['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(h['User-Agent']).toBe('home-deployer');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/commits/main');
  });

  it('401 gives the token message without the token', async () => {
    const { impl } = fake(() => ({ status: 401 }));
    const err = await new GitHub('o/r', 'secret', impl).head('main').catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.message).toBe('GitHub token expired or invalid');
    expect(err.status).toBe(401);
    expect(err.message).not.toContain('secret');
  });

  it('other failures name the status', async () => {
    const { impl } = fake(() => ({ status: 500 }));
    const err = await new GitHub('o/r', 't', impl).head('main').catch((e) => e);
    expect(err.message).toBe('GitHub answered 500');
    expect(err.status).toBe(500);
  });

  it('network errors', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const err = await new GitHub('o/r', 't', impl).head('main').catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.message).toBe("Can't reach GitHub");
  });
});

describe('GitHub.commitsSince', () => {
  const mk = (sha: string) => ({ sha, commit: { message: `m${sha}\nmore`, committer: { date: `d${sha}` } } });

  it('compare returns newest first and drops the base', async () => {
    const { impl, calls } = fake(() => ({ body: { commits: [mk('B'), mk('C')] } }));
    const out = await new GitHub('o/r', 't', impl).commitsSince('A', 'C');
    expect(out.map((c) => c.sha)).toEqual(['C', 'B']);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/compare/A...C');
  });

  it('without a base returns just the head commit', async () => {
    const { impl, calls } = fake(() => ({ body: mk('C') }));
    const out = await new GitHub('o/r', 't', impl).commitsSince(undefined, 'C');
    expect(out).toEqual([{ sha: 'C', message: 'mC', committedAt: 'dC' }]);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/commits/C');
  });
});

describe('GitHub.treeSha', () => {
  it('reads the directory entry sha', async () => {
    const { impl, calls } = fake(() => ({
      body: [
        { name: 'api', type: 'dir', sha: '1' },
        { name: 'deployer', type: 'dir', sha: 'tree123' },
      ],
    }));
    expect(await new GitHub('o/r', 't', impl).treeSha('abc', 'apps/deployer')).toBe('tree123');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/contents/apps?ref=abc');
  });

  it('missing entry is undefined', async () => {
    const { impl } = fake(() => ({ body: [{ name: 'deployer', type: 'file', sha: 'x' }] }));
    expect(await new GitHub('o/r', 't', impl).treeSha('abc', 'apps/deployer')).toBeUndefined();
  });
});
