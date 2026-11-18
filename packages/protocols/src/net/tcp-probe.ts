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

/** The `ports` on `host` that accept a TCP connection within `timeoutMs`, in the order given. Tried in parallel. */
export async function probeOpenPorts(host: string, ports: readonly number[], timeoutMs: number): Promise<number[]> {
  const results = await Promise.all(ports.map((p) => tryConnect(host, p, timeoutMs)));
  return ports.filter((_, i) => results[i]);
}

/** True when any of `ports` on `host` accepts a TCP connection within `timeoutMs`. */
export async function probeTcp(host: string, ports: readonly number[], timeoutMs: number): Promise<boolean> {
  return (await probeOpenPorts(host, ports, timeoutMs)).length > 0;
}
