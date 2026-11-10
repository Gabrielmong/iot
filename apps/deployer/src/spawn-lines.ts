import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import type { RunOptions } from './system.js';

/** Windows runs .cmd/.bat files (e.g. a global pnpm.cmd) only through cmd.exe. */
export function needsShell(cmd: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
}

/** Pure: the cmd.exe command line, every part double-quoted; a `"` inside would break quoting. */
export function shellCommandLine(cmd: string, args: string[]): string {
  const parts = [cmd, ...args];
  if (parts.some((p) => p.includes('"'))) {
    throw new Error(`Refusing to run ${path.basename(cmd)}: an argument contains a double quote`);
  }
  return parts.map((p) => `"${p}"`).join(' ');
}

/** On Windows child.kill() leaves grandchildren (cmd.exe → pnpm → node) running; taskkill /T takes the tree. */
function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () =>
      child.kill(),
    );
  } else {
    child.kill();
  }
}

function spawnChild(cmd: string, args: string[], opts: RunOptions): ChildProcess {
  const common = {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    windowsHide: true,
  };
  if (needsShell(cmd)) return spawn(shellCommandLine(cmd, args), { ...common, shell: true });
  return spawn(cmd, args, { ...common, shell: false });
}

export function spawnLines(cmd: string, args: string[], opts: RunOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnChild(cmd, args, opts);
    } catch (e) {
      reject(e);
      return;
    }
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, opts.timeoutMs)
      : undefined;
    for (const stream of [child.stdout!, child.stderr!]) {
      let buf = '';
      const emit = (line: string) => opts.onLine?.(line.replace(/\0/g, '').replace(/\r$/, ''));
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        buf += chunk;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        lines.forEach(emit);
      });
      stream.on('end', () => {
        if (buf) emit(buf);
      });
    }
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${path.basename(cmd)} timed out after ${opts.timeoutMs} ms`));
      else resolve(code ?? -1);
    });
  });
}
