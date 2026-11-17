import type { ApiJob, ApiRun, ApiStep } from '../github.js';
import type { CiJob, CiRun, CiState, CiStep } from './types.js';

const UNFINISHED: Record<string, CiState> = {
  queued: 'QUEUED',
  waiting: 'QUEUED',
  pending: 'QUEUED',
  requested: 'QUEUED',
  in_progress: 'RUNNING',
};

const CONCLUDED: Record<string, CiState> = {
  success: 'SUCCEEDED',
  failure: 'FAILED',
  timed_out: 'FAILED',
  startup_failure: 'FAILED',
  cancelled: 'CANCELLED',
  skipped: 'SKIPPED',
  neutral: 'SKIPPED',
};

export function toCiState(status: string, conclusion: string | null): CiState {
  if (status !== 'completed') return UNFINISHED[status] ?? 'UNKNOWN';
  return (conclusion && CONCLUDED[conclusion]) || 'UNKNOWN';
}

/** `startedAt`/`completedAt` only when GitHub has them. */
const times = (startedAt: string | null, completedAt: string | null) => ({
  ...(startedAt ? { startedAt } : {}),
  ...(completedAt ? { completedAt } : {}),
});

export function toRun(api: ApiRun, gatingWorkflow: string): Omit<CiRun, 'jobs' | 'jobsFinal'> {
  return {
    id: api.id,
    attempt: api.run_attempt,
    workflow: api.name,
    gatesDeploy: api.name === gatingWorkflow,
    state: toCiState(api.status, api.conclusion),
    completed: api.status === 'completed',
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    url: api.html_url,
  };
}

const toStep = (s: ApiStep): CiStep => ({
  number: s.number,
  name: s.name,
  state: toCiState(s.status, s.conclusion),
  ...times(s.started_at, s.completed_at),
});

export function toJob(api: ApiJob): CiJob {
  return {
    id: api.id,
    name: api.name,
    state: toCiState(api.status, api.conclusion),
    ...times(api.started_at, api.completed_at),
    url: api.html_url,
    steps: (api.steps ?? []).map(toStep),
  };
}

/** The run's commit: its message's first line and time, else the run's title and creation time. */
export function commitOf(api: ApiRun): { sha: string; message: string; committedAt: string } {
  return {
    sha: api.head_sha,
    message: api.head_commit ? api.head_commit.message.split('\n')[0]! : api.display_title,
    committedAt: api.head_commit?.timestamp ?? api.created_at,
  };
}
