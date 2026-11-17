import { describe, expect, it } from 'vitest';
import { GitHub, GitHubError } from '../src/github.js';

type Call = { url: string; init?: RequestInit };

function fake(handler: (url: string) => { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const { status = 200, body = {}, headers } = handler(u);
    return new Response(JSON.stringify(body), { status, headers });
  }) as typeof fetch;
  return { impl, calls };
}

type Run = { name?: string; status: string; conclusion: string | null };
const runs = (...r: Run[]) => ({ body: { workflow_runs: r.map((run) => ({ ...run, name: run.name ?? 'CI' })) } });
const done = (conclusion: string) => ({ status: 'completed', conclusion });

describe('GitHub.checkState', () => {
  async function state(r: ReturnType<typeof runs>) {
    const { impl } = fake(() => r);
    return new GitHub('o/r', 'tok', impl).checkState('abc');
  }

  it('maps workflow runs', async () => {
    expect(await state(runs())).toBe('none');
    expect(await state(runs(done('success'), { status: 'in_progress', conclusion: null }))).toBe('pending');
    expect(await state(runs(done('success'), done('failure')))).toBe('failure');
    expect(await state(runs(done('success'), done('skipped'), done('neutral')))).toBe('success');
  });

  it('only the CI workflow counts; other workflows (the Android build) are ignored', async () => {
    const ci = { name: 'CI', ...done('success') };
    expect(await state(runs(ci, { name: 'Android', status: 'in_progress', conclusion: null }))).toBe('success');
    expect(await state(runs(ci, { name: 'Android', ...done('failure') }))).toBe('success');
    expect(await state(runs({ name: 'Android', ...done('success') }))).toBe('none');
  });

  it('waits on the configured workflow name', async () => {
    const { impl } = fake(() =>
      runs({ name: 'Build', ...done('success') }, { name: 'CI', status: 'in_progress', conclusion: null }),
    );
    expect(await new GitHub('o/r', 'tok', impl, 'Build').checkState('abc')).toBe('success');
  });

  it('asks Actions for the runs of that commit (Actions: Read; fine-grained tokens have no Checks permission)', async () => {
    const { impl, calls } = fake(() => runs());
    await new GitHub('o/r', 'tok', impl).checkState('abc');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/actions/runs?head_sha=abc&per_page=100');
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

  it('403 names the missing permission, not an invalid token', async () => {
    const { impl } = fake(() => ({ status: 403, headers: { 'x-ratelimit-remaining': '4999' } }));
    const err = await new GitHub('o/r', 'secret', impl).checkState('abc').catch((e) => e);
    expect(err.message).toBe(
      'GitHub token is missing a permission: it needs Contents, Actions and Metadata: Read on this repo',
    );
    expect(err.status).toBe(403);
  });

  it.each([
    [403, { 'x-ratelimit-remaining': '0' }],
    [429, {}],
  ])('%i from the rate limit says so', async (status, headers) => {
    const { impl } = fake(() => ({ status, headers }));
    const err = await new GitHub('o/r', 't', impl).head('main').catch((e) => e);
    expect(err.message).toBe('GitHub rate limit reached; trying again later');
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

describe('GitHub.latestAndroidRelease', () => {
  const rel = (tag: string, ...assets: Array<[string, number]>) => ({
    tag_name: tag,
    assets: assets.map(([name, id]) => ({ name, id })),
  });
  async function latest(releases: unknown[]) {
    const { impl, calls } = fake(() => ({ body: releases }));
    return { out: await new GitHub('o/r', 't', impl).latestAndroidRelease(), calls };
  }

  it('picks the highest android-v<n> release that has home.apk', async () => {
    const { out, calls } = await latest([
      rel('v1.2', ['home.apk', 1]),
      rel('android-vx', ['home.apk', 2]),
      rel('android-v9', ['home.apk', 9]),
      rel('android-v12', ['home.apk', 12]),
      rel('android-v20', ['other.apk', 20]),
    ]);
    expect(out).toEqual({ versionCode: 12, assetId: 12 });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/releases?per_page=30');
  });

  it('is undefined when nothing matches', async () => {
    expect((await latest([rel('v1', ['home.apk', 1])])).out).toBeUndefined();
  });
});

describe('GitHub.downloadAsset', () => {
  it('asks for the octet-stream and fetches the redirect without the token', async () => {
    const calls: Call[] = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location: 'https://cdn.example/x' } });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as typeof fetch;
    const out = await new GitHub('o/r', 'secret', impl).downloadAsset(77);
    expect([...out]).toEqual([1, 2, 3]);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/releases/assets/77');
    const first = calls[0].init!;
    expect(first.redirect).toBe('manual');
    expect((first.headers as Record<string, string>).Accept).toBe('application/octet-stream');
    expect((first.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(calls[1].url).toBe('https://cdn.example/x');
    expect(JSON.stringify(calls[1].init ?? {})).not.toContain('secret');
    expect(JSON.stringify(calls[1].init ?? {})).not.toContain('Authorization');
  });

  it('accepts a direct 200', async () => {
    const impl = (async () => new Response(new Uint8Array([9]), { status: 200 })) as typeof fetch;
    expect([...(await new GitHub('o/r', 't', impl).downloadAsset(1))]).toEqual([9]);
  });
});

describe('GitHub timeouts', () => {
  it('passes an abort signal to the API call, the asset call and the redirect fetch', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      if (signals.length === 1) return new Response(null, { status: 302, headers: { location: 'https://cdn.example/x' } });
      return new Response(new Uint8Array([1]), { status: 200 });
    }) as typeof fetch;
    await new GitHub('o/r', 't', impl).downloadAsset(1);
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it('a fetch that aborts surfaces as a GitHubError', async () => {
    const impl = (async () => {
      throw new DOMException('aborted', 'TimeoutError');
    }) as typeof fetch;
    await expect(new GitHub('o/r', 't', impl).latestAndroidRelease()).rejects.toBeInstanceOf(GitHubError);
  });
});

describe('GitHub Actions detail', () => {
  /** Like fake(), but a null body for 304 (a Response can't carry one) and raw text bodies. */
  function raw(handler: (url: string, n: number) => { status?: number; body?: string | null; headers?: Record<string, string> }) {
    const calls: Call[] = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const { status = 200, body = null, headers } = handler(String(url), calls.length);
      return new Response(status === 304 ? null : body, { status, headers });
    }) as typeof fetch;
    return { impl, calls };
  }
  const headersOf = (c: Call) => (c.init?.headers ?? {}) as Record<string, string>;

  it('listPushRuns sends If-None-Match and returns changed:false on 304', async () => {
    const { impl, calls } = raw(() => ({ status: 304 }));
    expect(await new GitHub('o/r', 't', impl).listPushRuns('main', '"e1"')).toEqual({ changed: false });
    expect(headersOf(calls[0])['If-None-Match']).toBe('"e1"');
  });

  it('listPushRuns returns runs and the etag', async () => {
    const run = { id: 1, name: 'CI', head_sha: 'abc' };
    const { impl, calls } = raw(() => ({ body: JSON.stringify({ workflow_runs: [run] }), headers: { etag: '"e2"' } }));
    expect(await new GitHub('o/r', 't', impl).listPushRuns('main')).toEqual({ changed: true, data: [run], etag: '"e2"' });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/actions/runs?branch=main&event=push&per_page=20');
    expect(headersOf(calls[0])['If-None-Match']).toBeUndefined();
  });

  it("runJobs asks for the run's jobs", async () => {
    const job = { id: 5, name: 'test', steps: [] };
    const { impl, calls } = raw(() => ({ body: JSON.stringify({ jobs: [job] }) }));
    const out = await new GitHub('o/r', 't', impl).runJobs(42, '"j"');
    expect(out).toEqual({ changed: true, data: [job] });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/actions/runs/42/jobs?per_page=100');
    expect(headersOf(calls[0])['If-None-Match']).toBe('"j"');
  });

  it('jobLog follows the redirect without the token', async () => {
    const { impl, calls } = raw((_u, n) =>
      n === 1 ? { status: 302, headers: { location: 'https://logs.example/x' } } : { body: 'line1\nline2' },
    );
    expect(await new GitHub('o/r', 'secret', impl).jobLog(9)).toBe('line1\nline2');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/actions/jobs/9/logs');
    expect(calls[1].url).toBe('https://logs.example/x');
    expect(JSON.stringify(calls[1].init ?? {})).not.toContain('secret');
  });

  it.each([404, 410])('jobLog returns undefined on %i', async (status) => {
    const { impl } = raw(() => ({ status }));
    expect(await new GitHub('o/r', 't', impl).jobLog(9)).toBeUndefined();
  });

  it('rate limit error carries resetAt', async () => {
    const { impl } = raw(() => ({ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' } }));
    const err = await new GitHub('o/r', 't', impl).listPushRuns('main').catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.resetAt.getTime()).toBe(1790000000_000);
  });
});
