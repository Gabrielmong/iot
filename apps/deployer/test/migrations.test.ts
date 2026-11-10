import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ROLLBACK_BLOCKED,
  migrationsClientConfig,
  pendingMigrations,
  readAppliedMigrations,
  releaseMigrations,
  rollbackBlockedReason,
} from '../src/migrations.js';

describe('rollbackBlockedReason', () => {
  it('allows a release that has every applied migration', () => {
    expect(rollbackBlockedReason(['a', 'b'], ['a', 'b', 'c'])).toBeUndefined();
  });
  it('blocks a release missing an applied migration', () => {
    expect(rollbackBlockedReason(['a', 'b', 'c'], ['a', 'b'])).toBe(ROLLBACK_BLOCKED);
  });
});

describe('pendingMigrations', () => {
  it('lists release migrations not yet applied', () => {
    expect(pendingMigrations(['a'], ['a', 'b'])).toEqual(['b']);
  });
});

describe('releaseMigrations', () => {
  it('lists migration directories and skips the lock file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rel-'));
    const m = path.join(dir, 'apps', 'server', 'prisma', 'migrations');
    mkdirSync(path.join(m, '2_b'), { recursive: true });
    mkdirSync(path.join(m, '1_a'), { recursive: true });
    writeFileSync(path.join(m, 'migration_lock.toml'), 'x');
    expect(releaseMigrations(dir)).toEqual(['1_a', '2_b']);
  });
});

describe('readAppliedMigrations', () => {
  it('reads applied migration names from the test database', async () => {
    const applied = await readAppliedMigrations(process.env.DATABASE_URL_TEST!);
    expect(applied).toContain('20261106024258_init');
    expect([...applied].sort()).toEqual(applied);
  });

  it('limits the connect and the query so /status cannot hang', () => {
    expect(migrationsClientConfig('postgres://x')).toEqual({
      connectionString: 'postgres://x',
      connectionTimeoutMillis: 3000,
      statement_timeout: 1500,
      query_timeout: 1500,
    });
  });

  it('gives up on a server that never answers within about 3 s', async () => {
    const silent = createServer(() => undefined);
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const { port } = silent.address() as { port: number };
    const started = Date.now();
    try {
      await expect(readAppliedMigrations(`postgres://u:p@127.0.0.1:${port}/db`)).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(4500);
    } finally {
      silent.close();
    }
  }, 10_000);
});
