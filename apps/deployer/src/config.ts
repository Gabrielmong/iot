import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export interface DeployerConfig {
  root: string;
  githubRepo: string;
  branch: string;
  tokenFile: string;
  apiTokenFile: string;
  apiPort: number;
  serviceName: string;
  pollMs: number;
  ciWorkflowName: string;
  ciTimeoutMs: number;
  keepReleases: number;
  keepBackups: number;
  maxEvents: number;
  healthTimeoutMs: number;
  stepTimeoutsMs: StepTimeouts;
  bin: { node: string; pnpm: string; git: string; nssm: string; pgDump: string; powershell: string; tar: string };
  installedDeployerTree: string;
}

/** Per-step command limits; a timeout kills the command's process tree and fails the step. */
export interface StepTimeouts {
  fetch: number;
  export: number;
  helpers: number;
  install: number;
  build: number;
  protect: number;
  backup: number;
  migrate: number;
  settings: number; // apply-service-settings.ps1
}

export const DEFAULT_STEP_TIMEOUTS: StepTimeouts = {
  fetch: 300_000,
  export: 300_000,
  helpers: 600_000,
  install: 1_800_000,
  build: 1_800_000,
  protect: 300_000,
  backup: 900_000,
  migrate: 600_000,
  settings: 120_000,
};

export interface Paths {
  repo: string;
  releases: string;
  current: string;
  shared: string;
  android: string;
  envFile: string;
  logs: string;
  toolsCache: string;
  pnpmStore: string;
  data: string;
  eventLogs: string;
  backups: string;
  history: string;
}

const DEFAULTS = {
  branch: 'main',
  apiPort: 4100,
  serviceName: 'HomeControl',
  pollMs: 120_000,
  ciWorkflowName: 'CI',
  ciTimeoutMs: 1_800_000,
  keepReleases: 5,
  keepBackups: 10,
  maxEvents: 50,
  healthTimeoutMs: 60_000,
};

const REQUIRED = ['root', 'githubRepo', 'tokenFile', 'apiTokenFile', 'bin', 'installedDeployerTree'] as const;

export function loadConfig(file: string): DeployerConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const missing = REQUIRED.filter((k) => raw[k] === undefined || raw[k] === null || raw[k] === '');
  if (missing.length > 0) {
    throw new Error(`Deployer config ${file} is missing: ${missing.join(', ')}`);
  }
  const stepTimeoutsMs = { ...DEFAULT_STEP_TIMEOUTS, ...(raw.stepTimeoutsMs as Partial<StepTimeouts> | undefined) };
  return { ...DEFAULTS, ...raw, stepTimeoutsMs } as DeployerConfig;
}

export function pathsFor(root: string): Paths {
  const j = path.win32.join;
  const shared = j(root, 'shared');
  const data = j(root, 'deployer');
  return {
    repo: j(root, 'repo'),
    releases: j(root, 'releases'),
    current: j(root, 'current'),
    shared,
    android: j(shared, 'android'),
    envFile: j(shared, '.env'),
    logs: j(shared, 'logs'),
    toolsCache: j(shared, 'tools-cache'),
    pnpmStore: j(shared, 'pnpm-store'),
    data,
    eventLogs: j(data, 'logs'),
    backups: j(data, 'backups'),
    history: j(data, 'history.json'),
  };
}

export function readAppEnv(envFile: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(envFile, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read app env file ${envFile}: ${(err as Error).message}`);
  }
  const parsed = parseEnv(text);
  return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => e[1] !== undefined));
}
