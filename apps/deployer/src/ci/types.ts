/** One state per run, job and step (the spec's mapping of GitHub's status + conclusion). */
export type CiState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'SKIPPED' | 'UNKNOWN';

export interface CiStep {
  number: number;
  name: string;
  state: CiState;
  startedAt?: string;
  completedAt?: string;
}

export interface CiJob {
  id: number;
  name: string;
  state: CiState;
  startedAt?: string;
  completedAt?: string;
  url: string;
  steps: CiStep[];
}

export interface CiRun {
  id: number;
  attempt: number;
  workflow: string;
  /** The deploy waits on this workflow (config ciWorkflowName). */
  gatesDeploy: boolean;
  state: CiState;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
  jobs: CiJob[];
  /** The jobs were stored after the run completed: they won't change unless the run is re-run. */
  jobsFinal: boolean;
}

export interface CiCommit {
  sha: string;
  message: string;
  committedAt: string;
  firstSeenAt: string;
  runs: CiRun[];
}

export interface CiView {
  commits: CiCommit[];
  error?: string;
  lastCheckAt?: string;
}
