import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CiView } from '../src/ci/types.js';
import { type CiSource, Deployer, type Ops } from '../src/deployer.js';
import { type CheckState, type Commit, GitHubError } from '../src/github.js';
import type { DeployEvent } from '../src/history.js';
import { ROLLBACK_BLOCKED } from '../src/migrations.js';
import type { OpContext } from '../src/op-context.js';
import { OpError } from '../src/op-error.js';
import { switchCurrent } from '../src/releases.js';
import { type Fixture, M1, M2, NEW, OLD, TARGET, commit, setup } from './op-fixture.js';

const BLOCKED = 'b10cced000000000000000000000000000000000';

class FakeGitHub {
  headCommit: Commit = commit(NEW, 'new feature');
  commits: Commit[] = [commit(NEW, 'new feature')];
  states: Record<string, CheckState> = { [NEW]: 'success' };
  tree = 'tree-installed';
  headError?: Error;
  headCalls = 0;
  async head(): Promise<Commit> {
    this.headCalls += 1;
    if (this.headError) throw this.headError;
    return this.headCommit;
  }
  async commitsSince(): Promise<Commit[]> {
    return this.commits;
  }
  async checkState(sha: string): Promise<CheckState> {
    return this.states[sha] ?? 'none';
  }
  async treeSha(): Promise<string | undefined> {
    return this.tree;
  }
  releaseError?: Error;
  releaseCalls = 0;
  async latestAndroidRelease(): Promise<{ versionCode: number; assetId: number } | undefined> {
    this.releaseCalls += 1;
    if (this.releaseError) throw this.releaseError;
    return undefined;
  }
  agentReleaseError?: Error;
  agentReleaseCalls = 0;
  async latestAgentRelease(): Promise<{ version: number; exeAssetId: number; jsonAssetId: number } | undefined> {
    this.agentReleaseCalls += 1;
    if (this.agentReleaseError) throw this.agentReleaseError;
    return undefined;
  }
  async downloadAsset(): Promise<Buffer> {
    return Buffer.alloc(0);
  }
}

/** Stub operations that record an event like the real ones; `hold` keeps a deploy in flight. */
function stubOps() {
  let release: () => void = () => undefined;
  const state = { held: false };
  const gate = () =>
    state.held ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  const run = (kind: DeployEvent['kind']) => async (ctx: OpContext, sha: string | undefined, message: string, by: string) => {
    const ev = ctx.history.start({ kind, sha, message, by });
    await gate();
    ctx.history.finish(ev.id, 'SUCCEEDED');
    return ev;
  };
  const ops = {
    deployCommit: vi.fn((ctx: OpContext, c: Commit, by: string) => run('DEPLOY')(ctx, c.sha, c.message, by)),
    rollbackTo: vi.fn((ctx: OpContext, sha: string, by: string) => run('ROLLBACK')(ctx, sha, '', by)),
    restartApp: vi.fn((ctx: OpContext, by: string) => run('RESTART')(ctx, undefined, '', by)),
  } satisfies Ops;
  return {
    ops,
    hold: () => (state.held = true),
    release: () => release(),
  };
}

function fakeCi(view: CiView) {
  return {
    started: 0,
    stopped: 0,
    view: () => view,
    jobLog: async (id: string) => `log ${id}`,
    start() {
      this.started += 1;
    },
    async stop() {
      this.stopped += 1;
    },
  } satisfies CiSource & { started: number; stopped: number };
}

let f: Fixture;
let gh: FakeGitHub;
let stub: ReturnType<typeof stubOps>;
let d: Deployer;

beforeEach(() => {
  f = setup();
  Object.assign(f.ctx.config, { ciTimeoutMs: 1_800_000, pollMs: 120_000, installedDeployerTree: 'tree-installed' });
  f.runOld();
  gh = new FakeGitHub();
  stub = stubOps();
  d = new Deployer(f.ctx, gh, stub.ops);
});

afterEach(async () => {
  stub.release();
  await d.stop();
  f.cleanup();
});

describe('Deployer.tick', () => {
  it('tick deploys the picked commit as auto', async () => {
    await d.tick();
    expect(stub.ops.deployCommit).toHaveBeenCalledTimes(1);
    const [, c, by] = stub.ops.deployCommit.mock.calls[0]!;
    expect(c).toEqual(commit(NEW, 'new feature'));
    expect(by).toBe('auto');
    expect((await d.status()).lastCheck).toEqual({ at: f.ctx.now().toISOString() });
  });

  it('an APK sync failure changes neither lastCheck nor the deploy pick', async () => {
    gh.releaseError = new Error('releases unreachable');
    await d.tick();
    expect(gh.releaseCalls).toBe(1);
    expect(stub.ops.deployCommit).toHaveBeenCalledTimes(1);
    expect((await d.status()).lastCheck).toEqual({ at: f.ctx.now().toISOString() });
  });

  it('a HomeAgent sync failure changes neither lastCheck nor the deploy pick', async () => {
    gh.agentReleaseError = new Error('releases unreachable');
    await d.tick();
    expect(gh.agentReleaseCalls).toBe(1);
    expect(stub.ops.deployCommit).toHaveBeenCalledTimes(1);
    expect((await d.status()).lastCheck).toEqual({ at: f.ctx.now().toISOString() });
  });

  it('tick does nothing while paused', async () => {
    f.history.update({ autoDeploy: { on: false, reason: 'paused by Admin' } });
    await d.tick();
    expect(gh.headCalls).toBe(0);
    expect(stub.ops.deployCommit).not.toHaveBeenCalled();
  });

  it('records a failed check and keeps polling', async () => {
    gh.headError = new GitHubError('GitHub token expired or invalid', 401);
    await d.tick();
    expect((await d.status()).lastCheck?.error).toBe('GitHub token expired or invalid');
    await d.tick();
    expect(gh.headCalls).toBe(2);
    expect(stub.ops.deployCommit).not.toHaveBeenCalled();
  });

  it('records each skip once', async () => {
    gh.states = { [NEW]: 'failure' };
    await d.tick();
    await d.tick();
    const skipped = f.history.events().filter((e) => e.status === 'SKIPPED');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ kind: 'DEPLOY', sha: NEW, message: 'new feature', by: 'auto', detail: 'tests failed' });
    expect(f.history.state().skippedShas).toEqual([NEW]);
  });

  it('reports a helper update when the deployer tree changed', async () => {
    await d.tick();
    expect((await d.status()).helperUpdateAvailable).toBe(false);
    gh.tree = 'tree-newer';
    await d.tick();
    expect((await d.status()).helperUpdateAvailable).toBe(true);
  });

  it('tick skips while busy', async () => {
    stub.hold();
    await d.command({ type: 'restartApp', by: 'Admin' });
    await d.tick();
    expect(gh.headCalls).toBe(0);
  });
});

describe('Deployer.command', () => {
  it('busy refuses a second command with 409', async () => {
    stub.hold();
    const { eventId } = await d.command({ type: 'deployNow', by: 'Admin' });
    expect(f.history.events()[0]).toMatchObject({ id: eventId, kind: 'DEPLOY', status: 'RUNNING' });
    expect((await d.status()).busy).toBe('Deploying def5678');
    const second = d.command({ type: 'pause', by: 'Admin' });
    await expect(second).rejects.toBeInstanceOf(OpError);
    await expect(second).rejects.toMatchObject({ status: 409, message: 'Busy: Deploying def5678' });
    stub.release();
    await d.stop();
    expect((await d.status()).busy).toBeUndefined();
  });

  it('deployNow retries a failed sha', async () => {
    f.history.update({ failedShas: [NEW] });
    await d.command({ type: 'deployNow', by: 'Admin' });
    await d.stop();
    expect(stub.ops.deployCommit).toHaveBeenCalledTimes(1);
    expect(stub.ops.deployCommit.mock.calls[0]![1].sha).toBe(NEW);
    expect(stub.ops.deployCommit.mock.calls[0]![2]).toBe('Admin');
  });

  it('deployNow while paused stays paused', async () => {
    f.history.update({ autoDeploy: { on: false, reason: 'paused by Admin' } });
    await d.command({ type: 'deployNow', by: 'Admin' });
    await d.stop();
    expect(stub.ops.deployCommit).toHaveBeenCalledTimes(1);
    expect(f.history.state().autoDeploy).toEqual({ on: false, reason: 'paused by Admin' });
  });

  it('deployNow refuses when nothing is green or the green one is running', async () => {
    gh.states = { [NEW]: 'pending' };
    await expect(d.command({ type: 'deployNow', by: 'Admin' })).rejects.toMatchObject({
      status: 400,
      message: 'No green commit to deploy',
    });
    gh.headCommit = commit(OLD, 'old');
    gh.commits = [];
    gh.states = { [OLD]: 'success' };
    await expect(d.command({ type: 'deployNow', by: 'Admin' })).rejects.toMatchObject({
      status: 400,
      message: 'Already running a1b2c3d',
    });
    expect(stub.ops.deployCommit).not.toHaveBeenCalled();
    expect((await d.status()).busy).toBeUndefined();
  });

  it('pause and resume record events and the reason', async () => {
    const paused = await d.command({ type: 'pause', by: 'Admin' });
    expect(f.history.state().autoDeploy).toEqual({ on: false, reason: 'paused by Admin' });
    expect(f.history.events()[0]).toMatchObject({ id: paused.eventId, kind: 'PAUSE', status: 'SUCCEEDED', by: 'Admin' });
    const resumed = await d.command({ type: 'resume', by: 'Admin' });
    expect(f.history.state().autoDeploy).toEqual({ on: true });
    expect(f.history.events()[0]).toMatchObject({ id: resumed.eventId, kind: 'RESUME', status: 'SUCCEEDED' });
  });

  it('a blocked rollback is refused up front, not run in the background', async () => {
    f.applied = [M1, M2];
    f.addRelease(BLOCKED, [M1]);
    f.history.update({ releases: [OLD, BLOCKED] });
    await expect(d.command({ type: 'rollback', sha: BLOCKED, by: 'Admin' })).rejects.toMatchObject({
      status: 400,
      message: ROLLBACK_BLOCKED,
    });
    await expect(d.command({ type: 'rollback', sha: TARGET, by: 'Admin' })).rejects.toMatchObject({ status: 404 });
    expect(stub.ops.rollbackTo).not.toHaveBeenCalled();
    expect((await d.status()).busy).toBeUndefined();
  });

  it('an allowed rollback runs and returns its event', async () => {
    f.addRelease(TARGET, [M1]);
    f.history.update({ releases: [OLD, TARGET] });
    const { eventId } = await d.command({ type: 'rollback', sha: TARGET, by: 'Admin' });
    await d.stop();
    expect(stub.ops.rollbackTo).toHaveBeenCalledTimes(1);
    expect(f.history.events().find((e) => e.id === eventId)).toMatchObject({ kind: 'ROLLBACK', sha: TARGET });
  });
});

describe('Deployer.status', () => {
  it('status includes the CI view', async () => {
    const view: CiView = { commits: [], error: 'GitHub is down', lastCheckAt: 'now' };
    const ci = fakeCi(view);
    const withCi = new Deployer(f.ctx, gh, stub.ops, ci);
    expect((await withCi.status()).ci).toEqual(view);
    expect((await d.status()).ci).toEqual({ commits: [] });
  });

  it('start/stop start and stop the CI source, and ciJobLog asks it', async () => {
    const ci = fakeCi({ commits: [] });
    const withCi = new Deployer(f.ctx, gh, stub.ops, ci);
    withCi.start();
    expect(ci.started).toBe(1);
    expect(await withCi.ciJobLog('5')).toBe('log 5');
    await withCi.stop();
    expect(ci.stopped).toBe(1);
  });

  it('status marks rollback-blocked releases', async () => {
    f.applied = [M1, M2];
    f.addRelease(TARGET, [M1, M2]);
    f.addRelease(BLOCKED, [M1]);
    f.history.update({ releases: [OLD, TARGET, BLOCKED] });
    for (const sha of [BLOCKED, TARGET, OLD]) {
      f.history.record({ kind: 'DEPLOY', status: 'SUCCEEDED', sha, message: sha.slice(0, 7), by: 'auto' });
    }
    const { events } = await d.status();
    const bySha = (sha: string) => events.find((e) => e.sha === sha)!;
    expect(bySha(TARGET)).toMatchObject({ canRollback: true });
    expect(bySha(TARGET).rollbackBlockedReason).toBeUndefined();
    expect(bySha(BLOCKED)).toMatchObject({ canRollback: false, rollbackBlockedReason: ROLLBACK_BLOCKED });
    expect(bySha(OLD)).toMatchObject({ canRollback: false });
    expect(bySha(OLD).rollbackBlockedReason).toBeUndefined();
  });

  it('caches applied migrations for 10 s', async () => {
    const applied = vi.spyOn(f.ctx.migrations, 'applied');
    f.addRelease(TARGET, [M1]);
    f.history.update({ releases: [OLD, TARGET] });
    f.history.record({ kind: 'DEPLOY', status: 'SUCCEEDED', sha: TARGET, by: 'auto' });
    await d.status();
    await d.status();
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('running is what current really points at', async () => {
    f.addRelease(TARGET, [M1]);
    f.history.record({ kind: 'DEPLOY', status: 'FAILED', sha: TARGET, message: 'target msg', by: 'auto' });
    switchCurrent(f.paths, TARGET); // an interrupted op left current on TARGET
    expect((await d.status()).running).toMatchObject({ sha: TARGET, message: 'target msg' });
  });
});

describe('Deployer timer and shutdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first tick 10 s after start, then every pollMs', async () => {
    vi.useFakeTimers();
    d.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(gh.headCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(gh.headCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(gh.headCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(gh.headCalls).toBe(2);
  });

  it('a tick whose history write throws neither crashes nor stops the timer', async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(f.history, 'update').mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted, rename history.json.tmp'), { code: 'EPERM' });
    });
    d.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(gh.headCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(gh.headCalls).toBe(2);
    expect(errors).toHaveBeenCalled();
  });

  it('stop() waits for the operation in flight', async () => {
    stub.hold();
    await d.command({ type: 'restartApp', by: 'Admin' });
    let stopped = false;
    const stopping = d.stop().then(() => (stopped = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(stopped).toBe(false);
    stub.release();
    await stopping;
    expect(stopped).toBe(true);
  });

  it('refuses commands once stopping', async () => {
    await d.stop();
    await expect(d.command({ type: 'pause', by: 'Admin' })).rejects.toMatchObject({
      status: 409,
      message: 'Helper is shutting down',
    });
    expect(f.history.state().autoDeploy.on).toBe(true);
  });

  it('a check still waiting on GitHub when stop() is called deploys nothing', async () => {
    let answer!: () => void;
    const head = gh.head.bind(gh);
    gh.head = async () => {
      await new Promise<void>((r) => (answer = r));
      return head();
    };
    const ticking = d.tick();
    await new Promise((r) => setTimeout(r, 0));
    const stopping = d.stop();
    answer();
    await ticking;
    await stopping;
    expect(stub.ops.deployCommit).not.toHaveBeenCalled();
  });
});
