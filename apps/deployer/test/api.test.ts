import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { type Server, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApi } from '../src/api.js';
import type { Command } from '../src/command.js';
import type { StatusView } from '../src/deployer.js';
import { OpError } from '../src/op-error.js';

const TOKEN = 'api-token-0123456789';
const ID = '20261110120000000-a1b2c3';

class FakeDeployer {
  commands: Command[] = [];
  refuse?: OpError;
  async status(): Promise<StatusView> {
    return { autoDeploy: { on: true }, helperUpdateAvailable: false, events: [] };
  }
  async command(c: Command): Promise<{ eventId: string }> {
    if (this.refuse) throw this.refuse;
    this.commands.push(c);
    return { eventId: ID };
  }
}

let logs: string;
let server: Server;
let base: string;
let deployer: FakeDeployer;

beforeEach(async () => {
  logs = mkdtempSync(join(tmpdir(), 'api-'));
  deployer = new FakeDeployer();
  server = await startApi(deployer, { token: TOKEN, logsDir: logs, port: 0 });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  rmSync(logs, { recursive: true, force: true });
});

const auth = { Authorization: `Bearer ${TOKEN}` };
const post = (body: unknown, headers: Record<string, string> = auth) =>
  fetch(`${base}/commands`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('api', () => {
  it('401 without a token', async () => {
    expect((await fetch(`${base}/status`)).status).toBe(401);
    expect((await fetch(`${base}/status`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await post({ type: 'pause', by: 'Admin' }, {})).status).toBe(401);
    expect(deployer.commands).toEqual([]);
  });

  it('GET /status answers the StatusView', async () => {
    const res = await fetch(`${base}/status`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(await deployer.status());
  });

  it('400 for {type:"rm -rf"} and for a missing or non-string by/sha', async () => {
    for (const body of [{ type: 'rm -rf', by: 'Admin' }, { type: 'pause' }, { type: 'pause', by: 3 }, { type: 'rollback', by: 'Admin' }, { type: 'rollback', sha: 1, by: 'Admin' }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty('error');
    }
    const bad = await fetch(`${base}/commands`, { method: 'POST', headers: auth, body: '{not json' });
    expect(bad.status).toBe(400);
    expect(deployer.commands).toEqual([]);
  });

  it('202 and an eventId for pause', async () => {
    const res = await post({ type: 'pause', by: 'Admin' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ eventId: ID });
    expect(deployer.commands).toEqual([{ type: 'pause', by: 'Admin' }]);
  });

  it('an OpError answers its status and message', async () => {
    deployer.refuse = new OpError('Busy: Deploying abc1234', 409);
    const res = await post({ type: 'restartApp', by: 'Admin' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Busy: Deploying abc1234' });
  });

  it('413 for a body over 10 KB', async () => {
    const res = await post({ type: 'pause', by: 'x'.repeat(11 * 1024) });
    expect(res.status).toBe(413);
    expect(deployer.commands).toEqual([]);
  });

  it('413 as soon as a streamed body passes 10 KB, without waiting for its end', async () => {
    const port = (server.address() as AddressInfo).port;
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/commands', method: 'POST', headers: auth }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on('error', reject);
      req.write('x'.repeat(11 * 1024)); // chunked, no Content-Length, and never ended
    });
    expect(status).toBe(413);
    expect(deployer.commands).toEqual([]);
  });

  it('/events/:id/log answers the log, 404 for an unknown or malformed id', async () => {
    writeFileSync(join(logs, `${ID}.log`), 'one\ntwo\n');
    const ok = await fetch(`${base}/events/${ID}/log`, { headers: auth });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ log: 'one\ntwo\n' });
    expect((await fetch(`${base}/events/x/log`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${base}/events/..%2F..%2Fx/log`, { headers: auth })).status).toBe(404);
  });

  it('unknown routes are 404', async () => {
    expect((await fetch(`${base}/nope`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${base}/status`, { method: 'POST', headers: auth })).status).toBe(404);
  });

  it('the server listens on 127.0.0.1 only', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});
