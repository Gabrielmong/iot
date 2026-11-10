import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deployCommit } from '../src/deploy.js';
import { savedSettingsFile } from '../src/first-deploy-service.js';
import { currentTarget, isCurrent, releaseDir } from '../src/releases.js';
import {
  type Fixture,
  M1,
  M2,
  NEW,
  OLD,
  SECRETS,
  STEP_TIMEOUTS,
  commit,
  label,
  labels,
  nth,
  scriptRelease,
  setup,
} from './op-fixture.js';

let f: Fixture;
beforeEach(() => {
  f = setup();
});
afterEach(() => f.cleanup());

const failsOn = (name: string) => f.sys.failWhen((c) => label(c) === name, new Error(`${name} exited 1`));
const settingsRuns = () => f.sys.calls.filter((c) => label(c) === 'switch-settings').map(scriptRelease);

describe('deployCommit', () => {
  it('deploys in order', async () => {
    f.runOld();
    const ev = await deployCommit(f.ctx, commit(NEW, 'add rooms'), 'auto');

    expect(labels(f.sys)).toEqual([
      'fetch', 'archive', 'tar', 'helpers', 'install', 'build', 'protect', 'stop', 'migrate', 'switch-settings', 'start',
    ]);
    expect(f.sys.calls.find((c) => c.op === 'healthy')!.url).toBe('http://127.0.0.1:4000/');
    expect(ev).toMatchObject({ kind: 'DEPLOY', status: 'SUCCEEDED', sha: NEW, message: 'add rooms', by: 'auto' });
    const state = f.history.state();
    expect(state.running).toEqual({ sha: NEW, message: 'add rooms', deployedAt: '2026-11-10T09:00:00.000Z' });
    expect(state.releases).toEqual([NEW, OLD]);
    expect(isCurrent(f.paths, NEW)).toBe(true);
    expect(settingsRuns()).toEqual([releaseDir(f.paths, NEW)]);
  });

  it('runs each command with the agreed arguments', async () => {
    f.runOld();
    f.env.PORT = '4321';
    await deployCommit(f.ctx, commit(NEW), 'auto');
    const dir = releaseDir(f.paths, NEW);
    const byLabel = (l: string) => f.sys.calls.find((c) => label(c) === l)!;
    const ps = (file: string) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'scripts', file)];

    expect(byLabel('fetch').args).toEqual(['-C', f.paths.repo, 'fetch', 'origin', 'main']);
    expect(byLabel('fetch').env).toEqual(f.ctx.gitEnv());
    expect(JSON.stringify(byLabel('fetch').args)).not.toMatch(/Authorization|extraheader/i);
    const tar = path.join(f.paths.data, 'export-def5678.tar');
    expect(byLabel('archive').args).toEqual(['-C', f.paths.repo, 'archive', '-o', tar, NEW]);
    expect(byLabel('tar').args).toEqual(['-xf', tar, '-C', dir]);
    expect(existsSync(tar)).toBe(false);
    expect(byLabel('helpers').args).toEqual([
      ...ps('install-helpers.ps1'), '-Target', path.join(dir, 'tools'), '-Cache', f.paths.toolsCache,
    ]);
    expect(byLabel('install')).toMatchObject({
      cwd: dir,
      args: ['install', '--frozen-lockfile', '--config.package-import-method=copy', '--store-dir', f.paths.pnpmStore],
    });
    expect(byLabel('build')).toMatchObject({ cwd: dir, args: ['build'] });
    expect(byLabel('protect').args).toEqual([...ps('protect-release.ps1'), '-Path', dir]);
    expect(byLabel('migrate')).toMatchObject({
      cwd: dir,
      args: ['--filter', '@home/server', 'exec', 'prisma', 'migrate', 'deploy'],
      env: { DATABASE_URL: f.env.DATABASE_URL },
    });
    expect(byLabel('switch-settings').args).toEqual([
      ...ps('apply-service-settings.ps1'), '-Service', 'HomeControl', '-Root', f.root, '-Node', 'node',
    ]);
    expect(f.sys.calls.filter((c) => c.op !== 'run').every((c) => c.op === 'healthy' || c.cmd === 'HomeControl')).toBe(true);
    expect(f.sys.calls.find((c) => c.op === 'healthy')!.url).toBe('http://127.0.0.1:4321/');
  });

  it('gives every command its step timeout', async () => {
    f.runOld();
    await deployCommit(f.ctx, commit(NEW), 'auto');
    const timeouts = Object.fromEntries(f.sys.calls.filter((c) => c.op === 'run').map((c) => [label(c), c.timeoutMs]));
    expect(timeouts).toEqual({
      fetch: STEP_TIMEOUTS.fetch,
      archive: STEP_TIMEOUTS.export,
      tar: STEP_TIMEOUTS.export,
      helpers: STEP_TIMEOUTS.helpers,
      install: STEP_TIMEOUTS.install,
      build: STEP_TIMEOUTS.build,
      protect: STEP_TIMEOUTS.protect,
      migrate: STEP_TIMEOUTS.migrate,
      'switch-settings': STEP_TIMEOUTS.settings,
    });
  });

  it('a step timing out before stop fails and removes the release', async () => {
    f.runOld();
    f.sys.failWhen((c) => label(c) === 'install', new Error('pnpm timed out after 1004 ms'));
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toBe('Install failed: pnpm timed out after 1004 ms; still running a1b2c3d');
    expect(existsSync(releaseDir(f.paths, NEW))).toBe(false);
    expect(f.sys.calls.some((c) => c.op !== 'run')).toBe(false);
  });

  it('migrate timing out starts the old release again', async () => {
    f.runOld();
    f.newMigrations = [M1, M2];
    f.sys.failWhen((c) => label(c) === 'migrate', new Error('pnpm timed out after 1008 ms'));
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(labels(f.sys).slice(-3)).toEqual(['stop', 'migrate', 'start']);
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(f.sys.serviceState).toBe('running');
    expect(ev.detail).toBe('migration failed; still running a1b2c3d');
  });

  it('switches back even when the failed start left the app stopped', async () => {
    f.runOld();
    f.sys.failWhen(nth('start', 1), new Error('nssm exited 1'));
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    // After the failed start the service is stopped: the switch back must not fail on `nssm stop`.
    expect(labels(f.sys).slice(-4)).toEqual(['switch-settings', 'start', 'switch-settings', 'start']);
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(f.sys.serviceState).toBe('running');
    expect(ev.detail).toBe("didn't come up; rolled back automatically to a1b2c3d");
  });

  it('a first deploy works against a stopped service', async () => {
    f.sys.serviceState = 'stopped';
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(ev.status).toBe('SUCCEEDED');
    expect(labels(f.sys)).not.toContain('stop');
  });

  it('fails fast when DATABASE_URL is missing from .env', async () => {
    f.runOld();
    delete f.env.DATABASE_URL;
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(ev.detail).toBe('DATABASE_URL missing from .env; still running a1b2c3d');
    expect(f.sys.calls).toEqual([]);
  });

  it('logs pending migrations under the Backup section', async () => {
    f.runOld();
    f.newMigrations = [M1, M2];
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    const text = readFileSync(path.join(f.paths.eventLogs, `${ev.id}.log`), 'utf8');
    const lines = text.split('\n');
    const at = (s: string) => lines.findIndex((l) => l.startsWith(s));
    expect(at('▶ Backup')).toBeGreaterThan(at('✔ Lock down'));
    expect(at('Pending migrations: 20261105000000_rooms')).toBe(at('▶ Backup') + 1);
    expect(at('Backup written')).toBeGreaterThan(at('▶ Backup'));
    expect(at('✔ Backup')).toBeGreaterThan(at('Backup written'));
    expect(lines.filter((l) => l === '▶ Backup')).toHaveLength(1);
  });

  it('when switching back fails, running is what current points at', async () => {
    f.runOld();
    f.sys.healthResult = false;
    f.sys.failWhen(nth('stop', 2), new Error('HomeControl did not stop within 30 s'));
    const ev = await deployCommit(f.ctx, commit(NEW, 'add rooms'), 'auto');
    expect(ev.detail).toBe("didn't come up; switching back to a1b2c3d also failed");
    expect(isCurrent(f.paths, NEW)).toBe(true);
    expect(f.history.state().running).toMatchObject({ sha: NEW, message: 'add rooms' });
  });

  it('writes a redacted log per event, streaming command output', async () => {
    f.runOld();
    f.sys.output = (c) => (label(c) === 'install' ? [`token ${SECRETS[0]} and ${SECRETS[1]}`, 'db s3cretpw'] : []);
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    const text = readFileSync(path.join(f.paths.eventLogs, `${ev.id}.log`), 'utf8');
    expect(text).toContain('▶ Fetch');
    expect(text).toContain('▶ Health');
    expect(text).toContain('token *** and ***');
    for (const s of SECRETS) expect(text).not.toContain(s);
    expect(text).not.toContain('eC1hY2Nlc3MtdG9rZW46Z2hw');
  });

  it('backs up only when migrations are pending', async () => {
    f.runOld();
    await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(f.backups).toBe(0);

    f.newMigrations = [M1, M2];
    const NEXT = '9999999000000000000000000000000000000000';
    await deployCommit(f.ctx, commit(NEXT), 'auto');
    expect(f.backups).toBe(1);
  });

  it('build failure keeps the old version', async () => {
    f.runOld();
    failsOn('build');
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');

    expect(f.sys.calls.some((c) => c.op !== 'run')).toBe(false);
    expect(existsSync(releaseDir(f.paths, NEW))).toBe(false);
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toBe('Build failed: build exited 1; still running a1b2c3d');
    expect(f.history.state().failedShas).toEqual([NEW]);
    expect(f.history.state().running!.sha).toBe(OLD);
    expect(isCurrent(f.paths, OLD)).toBe(true);
  });

  it('a failure reading the database before stopping keeps the old version', async () => {
    f.runOld();
    f.ctx.migrations.applied = async () => {
      throw new Error('connection refused');
    };
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(ev.detail).toBe('Backup failed: connection refused; still running a1b2c3d');
    expect(f.sys.calls.some((c) => c.op !== 'run')).toBe(false);
    expect(existsSync(releaseDir(f.paths, NEW))).toBe(false);
  });

  it('health failure without migration rolls back automatically', async () => {
    f.runOld();
    f.sys.healthResults = [false, true];
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');

    expect(currentTarget(f.paths)).toBe(releaseDir(f.paths, OLD));
    expect(settingsRuns()).toEqual([releaseDir(f.paths, NEW), releaseDir(f.paths, OLD)]);
    expect(labels(f.sys).slice(-5)).toEqual(['switch-settings', 'start', 'stop', 'switch-settings', 'start']);
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toBe("didn't come up; rolled back automatically to a1b2c3d");
    expect(f.history.state().running!.sha).toBe(OLD);
    expect(f.history.state().releases).toEqual([OLD]);
    expect(f.history.state().failedShas).toEqual([NEW]);
  });

  it('says so when switching back also fails', async () => {
    f.runOld();
    f.sys.healthResult = false;
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(ev.detail).toBe("didn't come up; switching back to a1b2c3d also failed");
  });

  it('health failure after migration leaves it', async () => {
    f.runOld();
    f.newMigrations = [M1, M2];
    f.sys.healthResult = false;
    const ev = await deployCommit(f.ctx, commit(NEW, 'new rooms'), 'auto');

    expect(isCurrent(f.paths, NEW)).toBe(true);
    expect(f.history.state().autoDeploy.on).toBe(true);
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toBe("app didn't come up after a database change; push a fix");
    expect(f.history.state().running).toMatchObject({ sha: NEW, message: 'new rooms' });
    expect(f.history.state().failedShas).toEqual([NEW]);
    expect(f.history.state().releases).toEqual([OLD]);
    expect(labels(f.sys).filter((l) => l === 'stop')).toHaveLength(1);
  });

  it('migration failure restarts the old release', async () => {
    f.runOld();
    f.newMigrations = [M1, M2];
    failsOn('migrate');
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');

    expect(labels(f.sys).slice(-3)).toEqual(['stop', 'migrate', 'start']);
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(settingsRuns()).toEqual([]);
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toBe('migration failed; still running a1b2c3d');
    expect(f.history.state().running!.sha).toBe(OLD);
    expect(f.history.state().failedShas).toEqual([NEW]);
  });

  it('stop failure keeps the old version and starts it if it went down', async () => {
    f.runOld();
    // nssm stop errors out, but the service did go down meanwhile.
    const wentDown = (c: { op: string }) => {
      if (c.op !== 'stop') return false;
      f.sys.serviceState = 'stopped';
      return true;
    };
    f.sys.failWhen(wentDown, new Error('HomeControl did not stop within 30 s'));
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');

    expect(labels(f.sys, ['healthy']).slice(-3)).toEqual(['stop', 'status', 'start']);
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(ev.detail).toBe('Stop app failed: HomeControl did not stop within 30 s; still running a1b2c3d');
  });

  it('prunes to the kept releases plus current after success', async () => {
    f.ctx.config.keepReleases = 2;
    f.runOld();
    const MID = '5555555000000000000000000000000000000000';
    const GONE = '4444444000000000000000000000000000000000';
    f.addRelease(MID, [M1]);
    f.addRelease(GONE, [M1]);
    f.history.update({ releases: [OLD, MID, GONE] });
    await deployCommit(f.ctx, commit(NEW), 'auto');

    expect(f.history.state().releases).toEqual([NEW, OLD]);
    expect(readdirSync(f.paths.releases).sort()).toEqual(['a1b2c3d', 'def5678']);
  });

  it('never deletes the running release when asked to rebuild it', async () => {
    f.runOld();
    const ev = await deployCommit(f.ctx, commit(OLD), 'Gabriel');
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toMatch(/a1b2c3d is the release running now/);
    expect(existsSync(path.join(releaseDir(f.paths, OLD), 'apps'))).toBe(true);
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(f.sys.calls.some((c) => c.op !== 'run')).toBe(false);
  });

  it('a stale folder of the same name is replaced', async () => {
    f.runOld();
    const stale = path.join(releaseDir(f.paths, NEW), 'stale');
    mkdirSync(stale, { recursive: true });
    await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(existsSync(stale)).toBe(false);
  });

  it('an unreadable app env fails the deploy before anything changes', async () => {
    f.runOld();
    f.ctx.appEnv = () => {
      throw new Error('Cannot read app env file');
    };
    const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toMatch(/Cannot read app env file; still running a1b2c3d/);
    expect(f.sys.calls).toEqual([]);
  });

  it('a later success clears the sha from failedShas', async () => {
    f.runOld();
    f.history.update({ failedShas: [NEW] });
    await deployCommit(f.ctx, commit(NEW), 'Gabriel');
    expect(f.history.state().failedShas).toEqual([]);
  });

  describe('first deploy (nothing current yet)', () => {
    it('build failure fails as normal', async () => {
      failsOn('install');
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(ev.detail).toBe('Install failed: install exited 1');
      expect(existsSync(releaseDir(f.paths, NEW))).toBe(false);
    });

    const saved = () => savedSettingsFile(f.paths);
    const sets = () => f.sys.calls.filter((c) => label(c) === 'nssm-set' || label(c) === 'nssm-reset');
    const logText = (id: string) => readFileSync(path.join(f.paths.eventLogs, `${id}.log`), 'utf8');

    it('saves the service settings before stopping, and forgets them on success', async () => {
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      const l = labels(f.sys);
      expect(l.filter((x) => x === 'nssm-get')).toHaveLength(6);
      expect(l.lastIndexOf('nssm-get')).toBeLessThan(l.indexOf('stop'));
      expect(ev.status).toBe('SUCCEEDED');
      expect(f.history.state().releases).toEqual([NEW]);
      expect(existsSync(saved())).toBe(false);
    });

    it('health failure without migration restores the previous install', async () => {
      f.sys.healthResults = [false, true];
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(labels(f.sys).slice(-10)).toEqual([
        'switch-settings', 'start', 'stop', 'nssm-set', 'nssm-set', 'nssm-set', 'nssm-set', 'nssm-set', 'nssm-reset', 'start',
      ]);
      expect(sets().map((c) => c.args!.slice(2))).toEqual([
        ['Application', 'C:\\Program Files\\nodejs\\node.exe'],
        ['AppParameters', 'apps/server/dist/main.js'],
        ['AppDirectory', 'C:\\home-control'],
        ['AppEnvironmentExtra', 'NODE_ENV=production', 'GO2RTC_PATH=C:\\home-control\\tools\\go2rtc.exe'],
        ['AppStdout', 'C:\\home-control\\logs\\out.log'],
        ['AppStderr'],
      ]);
      expect(f.sys.serviceState).toBe('running');
      expect(currentTarget(f.paths)).toBeUndefined();
      expect(ev.status).toBe('FAILED');
      expect(ev.detail).toBe("didn't come up; restored the previous install");
      expect(logText(ev.id)).toContain('Restored the previous install');
      expect(f.history.state().failedShas).toEqual([NEW]);
      expect(f.history.state().autoDeploy.on).toBe(true);
      expect(f.history.state().running).toBeUndefined();
    });

    it('a failed settings script restores the previous install', async () => {
      failsOn('switch-settings');
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(sets()).toHaveLength(6);
      expect(f.sys.serviceState).toBe('running');
      expect(currentTarget(f.paths)).toBeUndefined();
      expect(ev.detail).toBe("didn't come up; restored the previous install");
    });

    it('a stop failure restores the settings and starts the old install', async () => {
      const wentDown = (c: { op: string }) => {
        if (c.op !== 'stop') return false;
        f.sys.serviceState = 'stopped';
        return true;
      };
      f.sys.failWhen(wentDown, new Error('HomeControl did not stop within 30 s'));
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(sets()).toHaveLength(6);
      expect(labels(f.sys).slice(-1)).toEqual(['start']);
      expect(labels(f.sys).filter((l) => l === 'stop')).toHaveLength(1);
      expect(f.sys.serviceState).toBe('running');
      expect(ev.detail).toBe('Stop app failed: HomeControl did not stop within 30 s; restored the previous install');
      expect(f.history.state().autoDeploy.on).toBe(true);
    });

    it('migration failure starts the old install again', async () => {
      f.applied = [];
      failsOn('migrate');
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(ev.status).toBe('FAILED');
      expect(ev.detail).toBe('migration failed; started the previous install again');
      expect(labels(f.sys).slice(-3)).toEqual(['stop', 'migrate', 'start']);
      expect(sets()).toEqual([]);
      expect(f.sys.serviceState).toBe('running');
      expect(currentTarget(f.paths)).toBeUndefined();
    });

    it('health failure after migration leaves the new release', async () => {
      f.applied = [];
      f.sys.healthResult = false;
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(ev.detail).toBe("app didn't come up after a database change; push a fix");
      expect(isCurrent(f.paths, NEW)).toBe(true);
      expect(sets()).toEqual([]);
      expect(f.history.state().failedShas).toEqual([NEW]);
      expect(f.history.state().autoDeploy.on).toBe(true);
      expect(labels(f.sys).filter((l) => l === 'stop')).toHaveLength(1);
    });

    it('says so when restoring the previous install fails too', async () => {
      f.sys.healthResult = false;
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(sets()).toHaveLength(6);
      expect(ev.detail).toBe("didn't come up; restoring the previous install also failed");
    });

    it('with no service to save, a failure says there is nothing to go back to', async () => {
      f.sys.serviceState = 'missing';
      f.sys.failWhen((c) => label(c) === 'switch-settings');
      const ev = await deployCommit(f.ctx, commit(NEW), 'auto');
      expect(labels(f.sys)).not.toContain('nssm-get');
      expect(sets()).toEqual([]);
      expect(ev.detail).toBe("didn't come up; there is no previous install to go back to");
    });
  });
});
