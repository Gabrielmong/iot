import net from 'node:net';

function tryConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** True when any of `ports` on `host` accepts a TCP connection within `timeoutMs`. Ports are tried in parallel. */
export async function probeTcp(host: string, ports: readonly number[], timeoutMs: number): Promise<boolean> {
  const results = await Promise.all(ports.map((p) => tryConnect(host, p, timeoutMs)));
  return results.some(Boolean);
}
