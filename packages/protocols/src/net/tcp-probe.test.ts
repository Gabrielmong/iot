import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { probeOpenPorts, probeTcp } from './tcp-probe.js';

const servers: net.Server[] = [];
afterEach(() => { for (const s of servers.splice(0)) s.close(); });

function listen(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer((c) => c.destroy());
    servers.push(s);
    s.listen(0, '127.0.0.1', () => resolve((s.address() as net.AddressInfo).port));
  });
}

async function closedPort(): Promise<number> {
  const port = await listen();
  await new Promise((r) => servers.pop()!.close(r));
  return port;
}

describe('probeTcp', () => {
  it('is true when any port accepts', async () => {
    const open = await listen();
    expect(await probeTcp('127.0.0.1', [await closedPort(), open], 1000)).toBe(true);
  });

  it('is false within the timeout when nothing accepts', async () => {
    const started = Date.now();
    expect(await probeTcp('127.0.0.1', [await closedPort()], 500)).toBe(false);
    expect(Date.now() - started).toBeLessThan(700);
  });
});

describe('probeOpenPorts', () => {
  it('returns only the ports that accept, in the order given', async () => {
    const a = await listen();
    const closed = await closedPort();
    const b = await listen();
    expect(await probeOpenPorts('127.0.0.1', [a, closed, b], 500)).toEqual([a, b]);
  });
});
