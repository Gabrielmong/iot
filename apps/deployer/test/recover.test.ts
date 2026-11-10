import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { savedSettingsFile } from '../src/first-deploy-service.js';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recoverOnStart } from '../src/recover.js';
import { type Fixture, NEW, setup } from './op-fixture.js';

let f: Fixture;
beforeEach(() => {
  f = setup();
});
afterEach(() => f.cleanup());

describe('recoverOnStart', () => {
  it('recovers an interrupted deploy', async () => {
    f.runOld();
    const done = f.history.record({ kind: 'RESTART', status: 'SUCCEEDED', by: 'Gabriel' });
    const ev = f.history.start({ kind: 'DEPLOY', sha: NEW, message: 'x', by: 'auto' });
    f.sys.serviceState = 'stopped';

    await recoverOnStart(f.ctx);

    const after = f.history.events().find((e) => e.id === ev.id)!;
    expect(after).toMatchObject({ status: 'FAILED', detail: 'helper stopped during this' });
    expect(after.finishedAt).toBeDefined();
    expect(f.history.events().find((e) => e.id === done.id)!.status).toBe('SUCCEEDED');
    expect(f.history.state().failedShas).toEqual([NEW]);
    expect(f.sys.calls.map((c) => c.op)).toEqual(['status', 'start']);
    expect(readFileSync(path.join(f.paths.eventLogs, `${ev.id}.log`), 'utf8')).toContain('helper stopped during this');
  });

  it.each(['running', 'other', 'missing'] as const)('does not start the app when it is %s', async (state) => {
    f.runOld();
    f.sys.serviceState = state;
    await recoverOnStart(f.ctx);
    expect(f.sys.calls.map((c) => c.op)).toEqual(['status']);
  });

  it('does not start anything before the first deploy', async () => {
    f.sys.serviceState = 'stopped';
    await recoverOnStart(f.ctx);
    expect(f.sys.calls).toEqual([]);
  });

  it('starts the old install when a first deploy stopped it and the helper died before the switch', async () => {
    mkdirSync(f.paths.data, { recursive: true });
    writeFileSync(savedSettingsFile(f.paths), '{}');
    f.sys.serviceState = 'stopped';
    await recoverOnStart(f.ctx);
    expect(f.sys.calls.map((c) => c.op)).toEqual(['status', 'start']);
    expect(existsSync(savedSettingsFile(f.paths))).toBe(true);
  });

  it('forgets saved first-deploy settings once current exists', async () => {
    f.runOld();
    mkdirSync(f.paths.data, { recursive: true });
    writeFileSync(savedSettingsFile(f.paths), '{}');
    f.sys.serviceState = 'running';
    await recoverOnStart(f.ctx);
    expect(existsSync(savedSettingsFile(f.paths))).toBe(false);
    expect(f.sys.calls.map((c) => c.op)).toEqual(['status']);
  });

  it('does not throw when starting fails', async () => {
    f.runOld();
    f.sys.serviceState = 'stopped';
    f.sys.failWhen((c) => c.op === 'start');
    await expect(recoverOnStart(f.ctx)).resolves.toBeUndefined();
  });
});
