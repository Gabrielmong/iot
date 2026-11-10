import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Paths } from './config.js';
import type { OpContext } from './op-context.js';

/** The HomeControl settings a first deploy changes, kept so a failed one can put the old install back. */
export const SAVED_SETTINGS = [
  'Application',
  'AppParameters',
  'AppDirectory',
  'AppEnvironmentExtra',
  'AppStdout',
  'AppStderr',
] as const;

/** Each setting's lines as `nssm get` prints them (AppEnvironmentExtra has one per variable). */
export type ServiceSettings = Record<(typeof SAVED_SETTINGS)[number], string[]>;

export const savedSettingsFile = (paths: Paths) => path.join(paths.data, 'first-deploy-service.json');

async function nssmGet(ctx: OpContext, key: string): Promise<string[]> {
  const lines: string[] = [];
  const { bin, serviceName } = ctx.config;
  await ctx.sys.run(bin.nssm, ['get', serviceName, key], { onLine: (l) => lines.push(l) });
  return lines.filter((l) => l.trim() !== '');
}

/**
 * Saves the service's settings. An existing file is kept: it holds the original install's settings
 * from an earlier first deploy. Nothing is saved when the service doesn't exist yet.
 */
export async function saveServiceSettings(ctx: OpContext): Promise<'saved' | 'kept' | 'no service'> {
  const file = savedSettingsFile(ctx.paths);
  if (existsSync(file)) return 'kept';
  if ((await ctx.sys.serviceStatus(ctx.config.serviceName)) === 'missing') return 'no service';
  const settings = {} as ServiceSettings;
  for (const key of SAVED_SETTINGS) settings[key] = await nssmGet(ctx, key);
  mkdirSync(ctx.paths.data, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(settings, null, 2));
  renameSync(`${file}.tmp`, file);
  return 'saved';
}

export function loadServiceSettings(paths: Paths): ServiceSettings | undefined {
  try {
    return JSON.parse(readFileSync(savedSettingsFile(paths), 'utf8')) as ServiceSettings;
  } catch {
    return undefined;
  }
}

/** `nssm set` for each saved setting; an empty one is reset to nssm's default. */
export async function writeServiceSettings(ctx: OpContext, settings: ServiceSettings): Promise<void> {
  const { bin, serviceName } = ctx.config;
  for (const key of SAVED_SETTINGS) {
    const values = settings[key] ?? [];
    const args = values.length > 0 ? ['set', serviceName, key, ...values] : ['reset', serviceName, key];
    await ctx.sys.run(bin.nssm, args);
  }
}

export function forgetServiceSettings(paths: Paths): void {
  rmSync(savedSettingsFile(paths), { force: true });
}
