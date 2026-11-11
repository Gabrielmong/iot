export type CheckState = 'pending' | 'success' | 'failure' | 'none';
export interface Commit {
  sha: string;
  message: string; // first line only
  committedAt: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

interface ApiCommit {
  sha: string;
  commit: { message: string; committer: { date: string } };
}

const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

function toCommit(c: ApiCommit): Commit {
  return { sha: c.sha, message: c.commit.message.split('\n')[0], committedAt: c.commit.committer.date };
}

export class GitHub {
  constructor(
    private readonly repo: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`https://api.github.com/repos/${this.repo}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'home-deployer',
        },
      });
    } catch {
      throw new GitHubError("Can't reach GitHub");
    }
    if (res.status === 401) throw new GitHubError('GitHub token expired or invalid', res.status);
    if (res.status === 403 || res.status === 429) {
      // 403 is a missing token permission (the token itself is fine) unless it is the rate limit.
      if (res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0') {
        throw new GitHubError('GitHub rate limit reached; trying again later', res.status);
      }
      throw new GitHubError(
        'GitHub token is missing a permission: it needs Contents, Checks, Actions and Metadata: Read on this repo',
        res.status,
      );
    }
    if (!res.ok) throw new GitHubError(`GitHub answered ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  async head(branch: string): Promise<Commit> {
    return toCommit(await this.get<ApiCommit>(`/commits/${branch}`));
  }

  async commitsSince(base: string | undefined, head: string): Promise<Commit[]> {
    if (base === undefined) return [toCommit(await this.get<ApiCommit>(`/commits/${head}`))];
    const res = await this.get<{ commits: ApiCommit[] }>(`/compare/${base}...${head}`);
    return res.commits.map(toCommit).reverse();
  }

  async checkState(sha: string): Promise<CheckState> {
    const res = await this.get<{ check_runs: Array<{ status: string; conclusion: string | null }> }>(
      `/commits/${sha}/check-runs?per_page=100`,
    );
    const runs = res.check_runs;
    if (runs.length === 0) return 'none';
    if (runs.some((r) => r.status !== 'completed')) return 'pending';
    if (runs.some((r) => !r.conclusion || !OK_CONCLUSIONS.has(r.conclusion))) return 'failure';
    return 'success';
  }

  async treeSha(sha: string, path: string): Promise<string | undefined> {
    const parts = path.split('/');
    const name = parts.pop();
    const parent = parts.join('/');
    const entries = await this.get<Array<{ name: string; type: string; sha: string }>>(
      `/contents/${parent}?ref=${sha}`,
    );
    return entries.find((e) => e.name === name && e.type === 'dir')?.sha;
  }
}
