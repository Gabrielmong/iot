import { Socket } from "node:net";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

/** Tuya local control. */
export const TUYA_TCP_PORT = 6668;

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

/**
 * The other addresses in the /24 of `lanAddress`, or (when it is not configured) of every private
 * IPv4 interface. Home networks are /24 in practice; a larger one is only partly covered.
 */
export function scanTargets(lanAddress: string | undefined, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const own = lanAddress
    ? [lanAddress]
    : Object.values(interfaces)
        .flat()
        .filter((i): i is NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal && PRIVATE.some((r) => r.test(i.address)))
        .map((i) => i.address);
  const targets = new Set<string>();
  for (const address of own) {
    const prefix = address.split(".").slice(0, 3).join(".");
    for (let host = 1; host <= 254; host++) targets.add(`${prefix}.${host}`);
  }
  for (const address of own) targets.delete(address);
  return [...targets];
}

function portOpen(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, ip);
  });
}

/** Addresses on the LAN accepting Tuya local connections (TCP 6668), 64 probes at a time. */
export async function scanTuyaHosts(lanAddress?: string, opts: { timeoutMs?: number; port?: number; targets?: string[] } = {}): Promise<string[]> {
  const targets = opts.targets ?? scanTargets(lanAddress);
  const open: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const ip = targets[next++]!;
      if (await portOpen(ip, opts.port ?? TUYA_TCP_PORT, opts.timeoutMs ?? 1200)) open.push(ip);
    }
  };
  await Promise.all(Array.from({ length: 64 }, worker));
  return open;
}
