import { backupDatabase } from './backup.js';
import { type DeployerConfig, type Paths, readAppEnv } from './config.js';
import { History } from './history.js';
import { readAppliedMigrations } from './migrations.js';
import { type OpContext, opSecrets } from './op-context.js';
import { type System, realSystem } from './system.js';

export interface Tokens {
  github: string;
  api: string;
}

/** The OpContext the service runs with: real history, app .env, pg_dump and the database. */
export function realContext(
  config: DeployerConfig,
  paths: Paths,
  tokens: Tokens,
  sys: System = realSystem(config.bin),
  readApplied: (databaseUrl: string) => Promise<string[]> = readAppliedMigrations,
): OpContext {
  const now = () => new Date();
  const appEnv = () => readAppEnv(paths.envFile);
  const databaseUrl = () => {
    const url = appEnv().DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL missing from .env');
    return url;
  };
  const basic = Buffer.from(`x-access-token:${tokens.github}`).toString('base64');

  return {
    config,
    paths,
    sys,
    history: new History(paths.history, paths.eventLogs, config.maxEvents, now),
    migrations: { applied: async () => readApplied(databaseUrl()) },
    backup: async (log) =>
      backupDatabase(sys, {
        pgDump: config.bin.pgDump,
        databaseUrl: databaseUrl(),
        dir: paths.backups,
        keep: config.keepBackups,
        now: now(),
        log,
        timeoutMs: config.stepTimeoutsMs.backup,
      }),
    appEnv,
    gitEnv: () => ({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    }),
    secrets: () => opSecrets([tokens.github, tokens.api, basic], appEnv),
    now,
  };
}
