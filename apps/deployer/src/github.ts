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

const API_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

function toCommit(c: ApiCommit): Commit {
  return { sha: c.sha, message: c.commit.message.split('\n')[0], committedAt: c.commit.committer.date };
}

export class GitHub {
  constructor(
    private readonly repo: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly ciWorkflowName = 'CI',
  ) {}

  private async request(path: string, headers: Record<string, string>, redirect?: 'manual',
    timeoutMs = API_TIMEOUT_MS,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`https://api.github.com/repos/${this.repo}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'home-deployer',
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
        ...(redirect ? { redirect } : {}),
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
        'GitHub token is missing a permission: it needs Contents, Actions and Metadata: Read on this repo',
        res.status,
      );
    }
    return res;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.request(path, { Accept: 'application/vnd.github+json' });
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

  /**
   * CI result from GitHub Actions workflow runs. (Fine-grained personal tokens can't get the Checks permission
   * that the check-runs API needs; Actions: Read is available.)
   */
  async checkState(sha: string): Promise<CheckState> {
    const res = await this.get<{ workflow_runs: Array<{ name: string; status: string; conclusion: string | null }> }>(
      `/actions/runs?head_sha=${sha}&per_page=100`,
    );
    // Other workflows (e.g. the Android build) must not block or fail a deploy.
    const runs = res.workflow_runs.filter((r) => r.name === this.ciWorkflowName);
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

  /** The newest `android-v<versionCode>` release that carries a `home.apk` asset. */
  async latestAndroidRelease(): Promise<{ versionCode: number; assetId: number } | undefined> {
    const releases = await this.get<Array<{ tag_name: string; assets: Array<{ name: string; id: number }> }>>(
      '/releases?per_page=30',
    );
    let best: { versionCode: number; assetId: number } | undefined;
    for (const r of releases) {
      const m = /^android-v(\d+)$/.exec(r.tag_name);
      const asset = r.assets.find((a) => a.name === 'home.apk');
      if (!m || !asset) continue;
      const versionCode = Number(m[1]);
      if (!best || versionCode > best.versionCode) best = { versionCode, assetId: asset.id };
    }
    return best;
  }

  /** The asset's bytes. The redirect target (a signed storage URL) is fetched without the token. */
  async downloadAsset(assetId: number): Promise<Buffer> {
    const res = await this.request(
      `/releases/assets/${assetId}`,
      { Accept: 'application/octet-stream' },
      'manual',
      DOWNLOAD_TIMEOUT_MS,
    );
    let body = res;
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new GitHubError(`GitHub answered ${res.status} without a location`, res.status);
      try {
        body = await this.fetchImpl(location, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      } catch {
        throw new GitHubError("Can't download the APK");
      }
    }
    if (!body.ok) throw new GitHubError(`GitHub answered ${body.status}`, body.status);
    return Buffer.from(await body.arrayBuffer());
  }
}
