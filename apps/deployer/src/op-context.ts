import path from 'node:path';
import type { DeployerConfig, Paths } from './config.js';
import { EventLog } from './event-log.js';
import type { History } from './history.js';
import { makeRedactor } from './redact.js';
import type { System } from './system.js';

export interface OpContext {
  config: DeployerConfig;
  paths: Paths;
  sys: System;
  history: History;
  migrations: { applied(): Promise<string[]> }; // wraps readAppliedMigrations(databaseUrl)
  backup(log: EventLog): Promise<string>;
  appEnv(): Record<string, string>; // readAppEnv(paths.envFile)
  /** Child-only env for git (never argv: command lines are visible to other users): GIT_CONFIG_* carrying http.https://github.com/.extraheader (sent to github.com only). */
  gitEnv(): Record<string, string>;
  /** Values never to write into a log: GitHub token, API token, every appEnv() value of 4+ chars. Build it with opSecrets. */
  secrets(): string[];
  now(): Date;
}

const MIN_SECRET_LENGTH = 4;

/** For OpContext.secrets(): the tokens plus every app env value of 4+ chars; never throws (no .env → tokens only). */
export function opSecrets(tokens: string[], appEnv: () => Record<string, string>): string[] {
  let values: string[] = [];
  try {
    values = Object.values(appEnv()).filter((v) => v.length >= MIN_SECRET_LENGTH);
  } catch {
    // .env missing or unreadable: nothing from it can leak
  }
  return [...tokens, ...values];
}

export const short = (sha: string) => sha.slice(0, 7);

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface OpLog {
  log: EventLog;
  redact: (s: string) => string;
}

/** The event's log file `<eventLogs>/<id>.log`, redacting every secret. */
export function openLog(ctx: OpContext, eventId: string): OpLog {
  let secrets: string[];
  try {
    secrets = ctx.secrets();
  } catch {
    secrets = []; // the built-in token and postgres-password patterns still apply
  }
  const redact = makeRedactor(secrets);
  return { log: new EventLog(path.join(ctx.paths.eventLogs, `${eventId}.log`), redact), redact };
}

export function healthUrl(env: Record<string, string>): string {
  return `http://127.0.0.1:${env.PORT || '4000'}/`;
}
