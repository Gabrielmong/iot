import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restartApp } from '../src/restart.js';
import { type Fixture, OLD, labels, setup } from './op-fixture.js';

let f: Fixture;
beforeEach(() => {
  f = setup();
  f.runOld();
});
afterEach(() => f.cleanup());

describe('restartApp', () => {
  it('restarts and checks health', async () => {
    const ev = await restartApp(f.ctx, 'Gabriel');
    expect(labels(f.sys)).toEqual(['restart']);
    expect(f.sys.calls.at(-1)).toMatchObject({ op: 'healthy', url: 'http://127.0.0.1:4000/' });
    expect(ev).toMatchObject({ kind: 'RESTART', status: 'SUCCEEDED', sha: OLD, by: 'Gabriel' });
  });

  it("fails when the app doesn't come up", async () => {
    f.sys.healthResult = false;
    const ev = await restartApp(f.ctx, 'Gabriel');
    expect(ev).toMatchObject({ status: 'FAILED', detail: "app didn't come up after restart" });
  });

  it('fails without throwing when nssm restart fails', async () => {
    f.sys.failWhen((c) => c.op === 'restart');
    const ev = await restartApp(f.ctx, 'Gabriel');
    expect(ev).toMatchObject({ status: 'FAILED', detail: "app didn't come up after restart" });
    expect(f.sys.calls.some((c) => c.op === 'healthy')).toBe(false);
  });
});
