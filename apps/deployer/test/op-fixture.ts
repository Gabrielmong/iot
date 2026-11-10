import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DeployerConfig, Paths } from '../src/config.js';
import type { Commit } from '../src/github.js';
import { History } from '../src/history.js';
import type { OpContext } from '../src/op-context.js';
import { releaseDir, switchCurrent } from '../src/releases.js';
import { type Call, FakeSystem } from './fakes.js';

export const OLD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
export const TARGET = 'abc1234ffffffffffffffffffffffffffffffff0';
export const NEW = 'def5678000000000000000000000000000000000';
export const M1 = '20261101000000_init';
export const M2 = '20261105000000_rooms';

export const commit = (sha: string, message = `commit ${sha.slice(0, 7)}`): Commit => ({
  sha,
  message,
  committedAt: '2026-11-10T08:00:00Z',
});

/** Distinct values so tests can tell which step's timeout a command got. */
export const STEP_TIMEOUTS = {
  fetch: 1001,
  export: 1002,
  helpers: 1003,
  install: 1004,
  build: 1005,
  protect: 1006,
  backup: 1007,
  migrate: 1008,
  settings: 1009,
};

export const SECRETS =['ghp_tokenvalue123', 'api-token-value', 's3cretpw'];

/** Native paths over a temp dir, so the tests run on Linux CI too (pathsFor uses path.win32). */
function tempPaths(root: string): Paths {
  const j = (...p: string[]) => path.join(root, ...p);
  return {
    repo: j('repo'),
    releases: j('releases'),
    current: j('current'),
    shared: j('shared'),
    envFile: j('shared', '.env'),
    logs: j('shared', 'logs'),
    toolsCache: j('shared', 'tools-cache'),
    pnpmStore: j('shared', 'pnpm-store'),
    data: j('deployer'),
    eventLogs: j('deployer', 'logs'),
    backups: j('deployer', 'backups'),
    history: j('deployer', 'history.json'),
  };
}

export interface Fixture {
  root: string;
  paths: Paths;
  sys: FakeSystem;
  history: History;
  ctx: OpContext;
  /** Migrations applied in the database. */
  applied: string[];
  /** Migrations the next exported release ships. */
  newMigrations: string[];
  backups: number;
  env: Record<string, string>;
  /** What `nssm get HomeControl <key>` prints (the old install's settings on a first deploy). */
  service: Record<string, string[]>;
  /** Creates a built release folder with these migrations. */
  addRelease(sha: string, migrations: string[]): string;
  /** A kept, running release that `current` points at. */
  runOld(migrations?: string[]): void;
  cleanup(): void;
}

export function setup(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), 'ops-'));
  const paths = tempPaths(root);
  mkdirSync(paths.releases, { recursive: true });
  mkdirSync(paths.repo, { recursive: true });
  const sys = new FakeSystem();
  const now = () => new Date('2026-11-10T09:00:00Z');
  const history = new History(paths.history, paths.eventLogs, 50, now);
  const config = {
    root,
    githubRepo: 'owner/home',
    branch: 'main',
    serviceName: 'HomeControl',
    keepReleases: 5,
    healthTimeoutMs: 1000,
    stepTimeoutsMs: STEP_TIMEOUTS,
    bin: { node: 'node', pnpm: 'pnpm', git: 'git', nssm: 'nssm', pgDump: 'pg_dump', powershell: 'powershell', tar: 'tar' },
  } as DeployerConfig;

  const addRelease = (sha: string, migrations: string[]) => {
    const dir = releaseDir(paths, sha);
    for (const m of migrations) mkdirSync(path.join(dir, 'apps', 'server', 'prisma', 'migrations', m), { recursive: true });
    mkdirSync(path.join(dir, 'apps', 'server', 'prisma', 'migrations'), { recursive: true });
    return dir;
  };

  const f: Fixture = {
    root,
    paths,
    sys,
    history,
    applied: [M1],
    newMigrations: [M1],
    backups: 0,
    env: { DATABASE_URL: 'postgresql://home:s3cretpw@localhost:5432/home' },
    service: {
      Application: ['C:\\Program Files\\nodejs\\node.exe'],
      AppParameters: ['apps/server/dist/main.js'],
      AppDirectory: ['C:\\home-control'],
      AppEnvironmentExtra: ['NODE_ENV=production', 'GO2RTC_PATH=C:\\home-control\\tools\\go2rtc.exe'],
      AppStdout: ['C:\\home-control\\logs\\out.log'],
      AppStderr: [],
    },
    addRelease,
    runOld(migrations = [M1]) {
      addRelease(OLD, migrations);
      switchCurrent(paths, OLD);
      history.update({ running: { sha: OLD, message: 'old', deployedAt: '2026-11-01T00:00:00Z' }, releases: [OLD] });
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    ctx: undefined as unknown as OpContext,
  };

  f.ctx = {
    config,
    paths,
    sys,
    history,
    migrations: { applied: async () => f.applied },
    backup: async (log) => {
      f.backups += 1;
      log.line('Backup written: home.dump');
      return path.join(paths.backups, 'home.dump');
    },
    appEnv: () => f.env,
    gitEnv: () => ({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2hw',
    }),
    secrets: () => SECRETS,
    now,
  };

  // nssm get prints the setting's lines (and a blank one, like the real nssm).
  sys.output = (c) =>
    path.basename(c.cmd!) === 'nssm' && c.args![0] === 'get' ? [...(f.service[c.args![2]!] ?? []), ''] : [];

  // git archive writes the tar file; tar extracts the release tree.
  sys.onRun((c) => {
    const name = path.basename(c.cmd!);
    if (name === 'git' && c.args!.includes('archive')) writeFileSync(c.args![c.args!.indexOf('-o') + 1]!, 'tar');
    if (name === 'tar') {
      const dir = c.args![c.args!.indexOf('-C') + 1]!;
      for (const m of f.newMigrations) {
        mkdirSync(path.join(dir, 'apps', 'server', 'prisma', 'migrations', m), { recursive: true });
      }
    }
  });
  return f;
}

const SCRIPT_LABELS: Record<string, string> = {
  'install-helpers.ps1': 'helpers',
  'protect-release.ps1': 'protect',
  'apply-service-settings.ps1': 'switch-settings',
};

/** A readable name for each call, matched by basename and args (not Windows path shape). */
export function label(c: Call): string {
  if (c.op !== 'run') return c.op;
  const name = path.basename(c.cmd!);
  const args = c.args!;
  if (name === 'git') return args.includes('fetch') ? 'fetch' : 'archive';
  if (name === 'tar') return 'tar';
  if (name === 'nssm') return `nssm-${args[0]}`;
  if (name === 'powershell') return SCRIPT_LABELS[path.basename(args[args.indexOf('-File') + 1]!)] ?? 'script?';
  if (name === 'pnpm') return args[0] === 'install' ? 'install' : args[0] === 'build' ? 'build' : 'migrate';
  return name;
}

export const labels = (sys: FakeSystem, skip: Call['op'][] = ['healthy', 'status']) =>
  sys.calls.filter((c) => !skip.includes(c.op)).map(label);

/** A failWhen predicate matching only the n-th call (1-based) of this op. */
export function nth(op: Call['op'], n: number): (c: Call) => boolean {
  let seen = 0;
  return (c) => c.op === op && ++seen === n;
}

/** The release folder a powershell call's script came from. */
export const scriptRelease = (c: Call) => path.dirname(path.dirname(c.args![c.args!.indexOf('-File') + 1]!));
