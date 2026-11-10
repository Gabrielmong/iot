import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROLLBACK_BLOCKED } from '../src/migrations.js';
import { OpError } from '../src/op-error.js';
import { isCurrent, releaseDir } from '../src/releases.js';
import { rollbackTo } from '../src/rollback.js';
import { type Fixture, M1, M2, OLD, TARGET, label, labels, nth, scriptRelease, setup } from './op-fixture.js';

let f: Fixture;
beforeEach(() => {
  f = setup();
  // TARGET is an older kept release; OLD is the running one.
  f.addRelease(TARGET, [M1]);
  f.runOld([M1, M2]);
  f.history.update({ releases: [OLD, TARGET] });
  f.history.record({ kind: 'DEPLOY', status: 'SUCCEEDED', sha: TARGET, message: 'target msg', by: 'auto' });
});
afterEach(() => f.cleanup());

const refusal = async (sha: string) => {
  const err = await rollbackTo(f.ctx, sha, 'Gabriel').catch((e: unknown) => e);
  expect(err).toBeInstanceOf(OpError);
  return err as OpError;
};

describe('rollbackTo', () => {
  it('rollback blocked across a database change', async () => {
    f.applied = [M1, M2];
    const err = await refusal(TARGET);
    expect(err.message).toBe(ROLLBACK_BLOCKED);
    expect(err.status).toBe(400);
    expect(f.sys.calls).toEqual([]);
    expect(f.history.events().filter((e) => e.kind === 'ROLLBACK')).toEqual([]);
  });

  it('rollback pauses auto-deploy', async () => {
    const ev = await rollbackTo(f.ctx, TARGET, 'Gabriel');

    expect(ev).toMatchObject({ kind: 'ROLLBACK', status: 'SUCCEEDED', sha: TARGET, by: 'Gabriel', message: 'target msg' });
    expect(f.history.state().autoDeploy).toEqual({ on: false, reason: 'rolled back to abc1234' });
    expect(f.history.state().running).toMatchObject({ sha: TARGET, message: 'target msg' });
    expect(isCurrent(f.paths, TARGET)).toBe(true);
    expect(labels(f.sys)).toEqual(['stop', 'switch-settings', 'start']);
    expect(scriptRelease(f.sys.calls.find((c) => label(c) === 'switch-settings')!)).toBe(releaseDir(f.paths, TARGET));
  });

  it('rollback refuses an unknown sha', async () => {
    const err = await refusal('0123456789012345678901234567890123456789');
    expect(err).toMatchObject({ status: 404, message: 'Unknown release 0123456' });
    expect(f.sys.calls).toEqual([]);
  });

  it('refuses a kept sha whose folder is gone', async () => {
    f.history.update({ releases: [OLD, TARGET, '7777777000000000000000000000000000000000'] });
    const err = await refusal('7777777000000000000000000000000000000000');
    expect(err).toMatchObject({ status: 404, message: 'Unknown release 7777777' });
  });

  it('refuses the running release', async () => {
    const err = await refusal(OLD);
    expect(err).toMatchObject({ status: 400, message: 'Already running a1b2c3d' });
    expect(f.sys.calls).toEqual([]);
  });

  it('refuses when the database cannot be read', async () => {
    f.ctx.migrations.applied = async () => {
      throw new Error('connection refused');
    };
    const err = await refusal(TARGET);
    expect(err.status).toBe(400);
    expect(f.sys.calls).toEqual([]);
  });

  it('on failure switches back to the previous release', async () => {
    f.sys.healthResults = [false, true];
    const ev = await rollbackTo(f.ctx, TARGET, 'Gabriel');

    expect(ev.status).toBe('FAILED');
    expect(ev.detail).toBe("abc1234 didn't come up; switched back to a1b2c3d");
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(f.history.state().running!.sha).toBe(OLD);
    expect(f.history.state().autoDeploy.on).toBe(true);
    expect(f.sys.calls.filter((c) => label(c) === 'switch-settings').map(scriptRelease)).toEqual([
      releaseDir(f.paths, TARGET),
      releaseDir(f.paths, OLD),
    ]);
  });

  it('when switching back fails, running is what current points at', async () => {
    f.sys.healthResult = false;
    f.sys.failWhen(nth('stop', 2));
    const ev = await rollbackTo(f.ctx, TARGET, 'Gabriel');
    expect(ev.detail).toBe("abc1234 didn't come up; switching back to a1b2c3d also failed");
    expect(isCurrent(f.paths, TARGET)).toBe(true);
    expect(f.history.state().running).toMatchObject({ sha: TARGET, message: 'target msg' });
    expect(f.history.state().autoDeploy.on).toBe(true);
  });

  it('when stopping fails it stays on the current release', async () => {
    f.sys.failWhen((c) => c.op === 'stop');
    f.sys.serviceState = 'running';
    const ev = await rollbackTo(f.ctx, TARGET, 'Gabriel');
    expect(ev.status).toBe('FAILED');
    expect(isCurrent(f.paths, OLD)).toBe(true);
    expect(labels(f.sys)).toEqual(['stop']);
    expect(ev.detail).toBe("couldn't switch to abc1234; still running a1b2c3d");
  });
});
