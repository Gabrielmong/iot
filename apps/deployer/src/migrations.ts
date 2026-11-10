import { readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const ROLLBACK_BLOCKED = "Can't roll back past a database change; push a fix instead.";

/** Migration directory names shipped in a release (excludes migration_lock.toml). */
export function releaseMigrations(releaseDir: string): string[] {
  const dir = path.join(releaseDir, 'apps', 'server', 'prisma', 'migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Connect plus query stays inside the app server's 5 s wait on /status. */
const CONNECT_MS = 3000;
const QUERY_MS = 1500;

export function migrationsClientConfig(databaseUrl: string): pg.ClientConfig {
  return {
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECT_MS,
    statement_timeout: QUERY_MS,
    query_timeout: QUERY_MS,
  };
}

export async function readAppliedMigrations(databaseUrl: string): Promise<string[]> {
  const client = new pg.Client(migrationsClientConfig(databaseUrl));
  await client.connect();
  try {
    const res = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    return res.rows.map((r) => r.migration_name).sort();
  } finally {
    await client.end();
  }
}

export function pendingMigrations(applied: string[], release: string[]): string[] {
  const done = new Set(applied);
  return release.filter((m) => !done.has(m));
}

export function rollbackBlockedReason(applied: string[], release: string[]): string | undefined {
  const have = new Set(release);
  return applied.some((m) => !have.has(m)) ? ROLLBACK_BLOCKED : undefined;
}
