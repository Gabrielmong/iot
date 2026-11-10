import dgram from 'node:dgram';

export const SSDP_ADDRESS = '239.255.255.250';
export const SSDP_PORT = 1900;

export interface SsdpReply {
  ip: string;
  server: string;
  location: string;
  usn: string;
  st: string;
}

export interface SsdpSearchOptions {
  /** Search targets; each gets its own M-SEARCH, sent twice (UDP may drop one). */
  st: string[];
  /** How long to collect replies. */
  timeoutMs: number;
  /** The local interface address to search from. */
  bindAddress?: string;
  /** Injected in tests. */
  socket?: () => dgram.Socket;
}

const mSearch = (st: string) =>
  Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);

/** Parses an M-SEARCH reply (`HTTP/1.1 200 OK` + headers); undefined for anything else. */
export function parseSsdpReply(text: string, ip: string): SsdpReply | undefined {
  const [status, ...lines] = text.split(/\r?\n/);
  if (!/^HTTP\/1\.[01] 200/i.test(status ?? '')) return undefined;
  const headers = new Map<string, string>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const usn = headers.get('usn');
  if (!usn) return undefined;
  return { ip, server: headers.get('server') ?? '', location: headers.get('location') ?? '', usn, st: headers.get('st') ?? '' };
}

/** Multicasts M-SEARCH for each target and collects the replies, one per (ip, usn). */
export async function ssdpSearch(opts: SsdpSearchOptions): Promise<SsdpReply[]> {
  const socket = (opts.socket ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true })))();
  const found = new Map<string, SsdpReply>();
  socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    const reply = parseSsdpReply(msg.toString('utf8'), rinfo.address);
    const key = reply && `${reply.ip} ${reply.usn}`;
    if (reply && key && !found.has(key)) found.set(key, reply);
  });
  socket.on('error', () => undefined); // a failed send or a closed interface just means fewer replies
  try {
    await new Promise<void>((resolve) => socket.bind({ address: opts.bindAddress }, () => resolve()));
    for (const st of opts.st) {
      for (let i = 0; i < 2; i++) socket.send(mSearch(st), SSDP_PORT, SSDP_ADDRESS, () => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, opts.timeoutMs));
  } finally {
    socket.close();
  }
  return [...found.values()];
}
