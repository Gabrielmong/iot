import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupDatabase } from '../src/backup.js';
import { EventLog } from '../src/event-log.js';
import { FakeSystem } from './fakes.js';

function setup() {
  const base = mkdtempSync(path.join(tmpdir(), 'bk-'));
  const logFile = path.join(base, 'log.txt');
  return { base, dir: path.join(base, 'backups'), logFile, log: new EventLog(logFile, (s) => s) };
}

describe('backupDatabase', () => {
  it('runs pg_dump without the password in args and returns the file path', async () => {
    const { dir, log } = setup();
    const sys = new FakeSystem();
    const now = new Date(2026, 10, 10, 9, 5, 7);
    const file = await backupDatabase(sys, {
      pgDump: 'pg_dump.exe',
      databaseUrl: 'postgresql://u:s3cret@localhost:5432/home',
      dir,
      keep: 10,
      now,
      log,
      timeoutMs: 900000,
    });
    const expected = path.join(dir, 'home-20261110-090507.dump');
    expect(file).toBe(expected);
    expect(sys.calls).toHaveLength(1);
    const call = sys.calls[0]!;
    expect(call.cmd).toBe('pg_dump.exe');
    expect(call.args).toEqual([
      '--format=custom',
      '--file',
      expected,
      '--dbname',
      'postgresql://u@localhost:5432/home',
    ]);
    expect(call.env).toEqual({ PGPASSWORD: 's3cret' });
    expect(call.timeoutMs).toBe(900000);
    expect(JSON.stringify(call.args)).not.toContain('s3cret');
  });

  it('keeps the newest 10 dumps, leaves other files, logs without secrets', async () => {
    const { dir, log, logFile } = setup();
    const sys = new FakeSystem();
    const { mkdirSync, readFileSync } = await import('node:fs');
    mkdirSync(dir);
    for (let d = 1; d <= 11; d++) {
      writeFileSync(path.join(dir, `home-202611${String(d).padStart(2, '0')}-000000.dump`), 'x');
    }
    writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
    sys.onRun((c) => writeFileSync(c.args![2]!, 'dump'));
    await backupDatabase(sys, {
      pgDump: 'pg_dump',
      databaseUrl: 'postgresql://u:s3cret@localhost/home',
      dir,
      keep: 10,
      now: new Date(2026, 10, 20, 0, 0, 0),
      log,
    });
    const files = readdirSync(dir).sort();
    expect(files.filter((f) => f.endsWith('.dump'))).toHaveLength(10);
    expect(existsSync(path.join(dir, 'home-20261101-000000.dump'))).toBe(false);
    expect(existsSync(path.join(dir, 'home-20261102-000000.dump'))).toBe(false);
    expect(files).toContain('notes.txt');
    expect(files).toContain('home-20261120-000000.dump');
    const text = readFileSync(logFile, 'utf8');
    expect(text).toContain('Backup written: home-20261120-000000.dump');
    expect(text).not.toContain('▶'); // the caller's step owns the section
    expect(text).toContain('home-20261120-000000.dump');
    expect(text).not.toContain('s3cret');
  });
});
