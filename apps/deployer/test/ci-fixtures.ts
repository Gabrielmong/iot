import type { ApiRun } from '../src/github.js';

/** A GitHub workflow run as the API sends it: a green CI run on `abc` unless overridden. */
export function apiRun(o: Partial<ApiRun> = {}): ApiRun {
  return {
    id: 1,
    run_attempt: 1,
    name: 'CI',
    head_sha: 'abc',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:04:00Z',
    html_url: 'https://github.com/o/r/actions/runs/1',
    display_title: 'Fix the thing',
    head_commit: { message: 'Fix the thing\n\nbody', timestamp: '2026-11-16T09:59:00Z' },
    ...o,
  };
}
