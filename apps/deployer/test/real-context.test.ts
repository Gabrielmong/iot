import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeployerConfig, Paths } from '../src/config.js';
import { EventLog } from '../src/event-log.js';
import { realContext } from '../src/real-context.js';
import { FakeSystem } from './fakes.js';
import { STEP_TIMEOUTS } from './op-fixture.js';

const URL_ = 'postgresql://home:s3cretpw@localhost:5432/home';
let root: string;
let config: DeployerConfig;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'realctx-'));
  config = {
    root,
    keepBackups: 10,
    maxEvents: 50,
    stepTimeoutsMs: STEP_TIMEOUTS,
    bin: { pgDump: 'pg_dump' },
  } as DeployerConfig;
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const writeEnv = (text: string) => {
  mkdirSync(path.join(root, 'shared'), { recursive: true });
  writeFileSync(path.join(root, 'shared', '.env'), text);
};

/** Only the paths the context uses. */
const paths = () =>
  ({
    envFile: path.join(root, 'shared', '.env'),
    backups: path.join(root, 'deployer', 'backups'),
    history: path.join(root, 'deployer', 'history.json'),
    eventLogs: path.join(root, 'deployer', 'logs'),
  }) as Paths;

describe('realContext', () => {
  it('secrets are both tokens plus the app env values', () => {
    writeEnv(`DATABASE_URL=${URL_}\nSESSION_SECRET=sessionvalue\nX=ab\n`);
    const ctx = realContext(config, paths(), { github: 'ghp_tok123', api: 'api-tok-456' }, new FakeSystem());
    expect(ctx.secrets()).toEqual(expect.arrayContaining(['ghp_tok123', 'api-tok-456', URL_, 'sessionvalue']));
    expect(ctx.secrets()).not.toContain('ab');
  });

  it('git auth goes through child-only env config (not argv): a basic header for x-access-token, scoped to github.com, and its value is a secret', () => {
    const ctx = realContext(config, paths(), { github: 'ghp_tok123', api: 'api' }, new FakeSystem());
    const basic = Buffer.from('x-access-token:ghp_tok123').toString('base64');
    expect(ctx.gitEnv()).toEqual({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    });
    expect(ctx.secrets()).toContain(basic);
  });

  it('backup runs pg_dump with the backup step timeout', async () => {
    writeEnv(`DATABASE_URL=${URL_}\n`);
    const sys = new FakeSystem();
    const ctx = realContext(config, paths(), { github: 'g', api: 'a' }, sys);
    const log = new EventLog(path.join(root, 'log.txt'), (s) => s);
    const file = await ctx.backup(log);
    expect(path.dirname(file)).toBe(paths().backups);
    expect(sys.calls).toHaveLength(1);
    expect(sys.calls[0]).toMatchObject({ op: 'run', cmd: 'pg_dump', timeoutMs: STEP_TIMEOUTS.backup });
  });

  it('applied migrations read the app DATABASE_URL', async () => {
    writeEnv(`DATABASE_URL=${URL_}\n`);
    const seen: string[] = [];
    const read = async (url: string) => (seen.push(url), ['m1']);
    const ctx = realContext(config, paths(), { github: 'g', api: 'a' }, new FakeSystem(), read);
    expect(await ctx.migrations.applied()).toEqual(['m1']);
    expect(seen).toEqual([URL_]);
    writeEnv('OTHER=1\n');
    await expect(ctx.migrations.applied()).rejects.toThrow('DATABASE_URL missing');
  });
});
