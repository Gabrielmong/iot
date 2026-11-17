import { describe, expect, it } from 'vitest';
import { commitOf, toCiState, toJob, toRun } from '../src/ci/ci-map.js';
import type { ApiJob } from '../src/github.js';
import { apiRun } from './ci-fixtures.js';


describe('toCiState follows the spec table', () => {
  it.each([
    ['queued', null, 'QUEUED'],
    ['waiting', null, 'QUEUED'],
    ['pending', null, 'QUEUED'],
    ['requested', null, 'QUEUED'],
    ['in_progress', null, 'RUNNING'],
    ['completed', 'success', 'SUCCEEDED'],
    ['completed', 'failure', 'FAILED'],
    ['completed', 'timed_out', 'FAILED'],
    ['completed', 'startup_failure', 'FAILED'],
    ['completed', 'cancelled', 'CANCELLED'],
    ['completed', 'skipped', 'SKIPPED'],
    ['completed', 'neutral', 'SKIPPED'],
    ['completed', 'action_required', 'UNKNOWN'],
    ['completed', 'stale', 'UNKNOWN'],
    ['completed', null, 'UNKNOWN'],
  ] as const)('%s / %s → %s', (status, conclusion, state) => {
    expect(toCiState(status, conclusion)).toBe(state);
  });
});

describe('toRun', () => {
  it('marks gatesDeploy by workflow name and completed by status', () => {
    expect(toRun(apiRun({ run_attempt: 2 }), 'CI')).toEqual({
      id: 1,
      attempt: 2,
      workflow: 'CI',
      gatesDeploy: true,
      state: 'SUCCEEDED',
      completed: true,
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:04:00Z',
      url: 'https://github.com/o/r/actions/runs/1',
    });
    const android = toRun(apiRun({ name: 'Android', status: 'in_progress', conclusion: null }), 'CI');
    expect(android).toMatchObject({ gatesDeploy: false, completed: false, state: 'RUNNING' });
  });
});

describe('toJob', () => {
  it('maps a queued job without steps to steps: []', () => {
    const job: ApiJob = { id: 7, name: 'test', status: 'queued', conclusion: null, started_at: null, completed_at: null, html_url: 'u' };
    expect(toJob(job)).toEqual({ id: 7, name: 'test', state: 'QUEUED', url: 'u', steps: [] });
  });

  it('maps steps and keeps their timestamps', () => {
    const job: ApiJob = {
      id: 7,
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      started_at: 'a',
      completed_at: 'b',
      html_url: 'u',
      steps: [{ name: 'pnpm test', number: 6, status: 'completed', conclusion: 'failure', started_at: 'c', completed_at: null }],
    };
    expect(toJob(job)).toEqual({
      id: 7,
      name: 'test',
      state: 'FAILED',
      startedAt: 'a',
      completedAt: 'b',
      url: 'u',
      steps: [{ number: 6, name: 'pnpm test', state: 'FAILED', startedAt: 'c' }],
    });
  });
});

describe('commitOf', () => {
  it('takes the first line of the head commit message and its timestamp', () => {
    expect(commitOf(apiRun())).toEqual({ sha: 'abc', message: 'Fix the thing', committedAt: '2026-11-16T09:59:00Z' });
  });

  it('falls back to display_title and created_at when head_commit is null', () => {
    expect(commitOf(apiRun({ head_commit: null }))).toEqual({
      sha: 'abc',
      message: 'Fix the thing',
      committedAt: '2026-11-16T10:00:00Z',
    });
  });
});
