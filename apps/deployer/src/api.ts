import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { parseCommand } from './command.js';
import type { Deployer } from './deployer.js';
import { readLog } from './history.js';
import { OpError } from './op-error.js';

export interface ApiOptions {
  token: string;
  logsDir: string;
  port: number;
}

const BODY_LIMIT = 10 * 1024;
const HOST = '127.0.0.1';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function authorized(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const tooLarge = () => new HttpError(413, 'Body too large');

/** The JSON body, at most 10 KB: 413 as soon as it is known to be larger (the request is then cut off). */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) return reject(tooLarge());
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size <= BODY_LIMIT) return void chunks.push(chunk);
      req.off('data', onData);
      req.pause();
      reject(tooLarge());
    };
    req.on('data', onData);
    req.on('error', reject);
    req.on('end', () => {
      if (size > BODY_LIMIT) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Body is not JSON'));
      }
    });
  });
}

type Api = Pick<Deployer, 'status' | 'command' | 'ciJobLog'>;

/** The decoded path segment, or a 404 when it doesn't decode. */
function segment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new HttpError(404, 'Not found');
  }
}

async function route(api: Api, opts: ApiOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = new URL(req.url ?? '/', `http://${HOST}`).pathname;
  if (req.method === 'GET' && path === '/status') return send(res, 200, await api.status());
  const logMatch = /^\/events\/([^/]+)\/log$/.exec(path);
  if (req.method === 'GET' && logMatch) {
    const log = readLog(opts.logsDir, segment(logMatch[1]!));
    if (log === undefined) throw new HttpError(404, 'Not found');
    return send(res, 200, { log });
  }
  const jobMatch = /^\/ci\/jobs\/([^/]+)\/log$/.exec(path);
  if (req.method === 'GET' && jobMatch) {
    const log = await api.ciJobLog(segment(jobMatch[1]!));
    if (log === undefined) throw new HttpError(404, 'Not found');
    return send(res, 200, { log });
  }
  if (req.method === 'POST' && path === '/commands') {
    const command = parseCommand(await readJson(req));
    return send(res, 202, await api.command(command));
  }
  throw new HttpError(404, 'Not found');
}

export function createApi(api: Api, opts: ApiOptions): Server {
  return createServer((req, res) => {
    if (!authorized(req, opts.token)) {
      req.resume();
      return send(res, 401, { error: 'Unauthorized' });
    }
    route(api, opts, req, res).catch((e: unknown) => {
      if (e instanceof HttpError && e.status === 413) {
        res.once('finish', () => req.destroy()); // don't read the rest of an oversized body
        return send(res, 413, { error: e.message });
      }
      if (e instanceof OpError || e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error('API request failed:', e);
      send(res, 500, { error: 'Internal error' });
    });
  });
}

/** Listens on 127.0.0.1 only. */
export function startApi(api: Api, opts: ApiOptions): Promise<Server> {
  const server = createApi(api, opts);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, HOST, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
