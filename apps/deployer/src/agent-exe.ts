import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GitHub } from './github.js';

export interface AgentSyncOptions {
  dir: string;
  github: Pick<GitHub, 'latestAgentRelease' | 'downloadAsset'>;
  log: (msg: string) => void;
}

const EXE = 'HomeAgent.exe';
const JSON_FILE = 'agent.json';

function heldVersion(dir: string): number {
  try {
    const { version } = JSON.parse(readFileSync(path.join(dir, JSON_FILE), 'utf8')) as { version?: unknown };
    return Number.isInteger(version) && (version as number) > 0 && existsSync(path.join(dir, EXE)) ? (version as number) : 0;
  } catch {
    return 0;
  }
}

/** The release's agent.json, checked against its tag and the exe's bytes. */
function checkedManifest(raw: Buffer, tagVersion: number, exe: Buffer): { version: number; sha256: string } {
  const m = JSON.parse(raw.toString('utf8')) as { version?: unknown; sha256?: unknown };
  if (m.version !== tagVersion) throw new Error(`agent.json says version ${String(m.version)}, the release is ${tagVersion}`);
  const actual = createHash('sha256').update(exe).digest('hex');
  if (typeof m.sha256 !== 'string' || m.sha256.toLowerCase() !== actual) {
    throw new Error("HomeAgent.exe doesn't match the SHA-256 in agent.json");
  }
  return { version: tagVersion, sha256: actual };
}

function replaceFile(target: string, data: Buffer | string): void {
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, target);
}

/**
 * Keeps `<dir>/HomeAgent.exe` + `agent.json` at the newest `agent-v<n>` release, after checking the exe's
 * SHA-256. A failure leaves the previous pair as it was and is only logged.
 */
export async function syncAgentExe({ dir, github, log }: AgentSyncOptions): Promise<void> {
  try {
    const release = await github.latestAgentRelease();
    if (!release || release.version <= heldVersion(dir)) return;
    const exe = await github.downloadAsset(release.exeAssetId);
    const manifest = checkedManifest(await github.downloadAsset(release.jsonAssetId), release.version, exe);
    mkdirSync(dir, { recursive: true });
    replaceFile(path.join(dir, EXE), exe);
    replaceFile(path.join(dir, JSON_FILE), JSON.stringify(manifest));
    log(`HomeAgent ${release.version} is ready to offer`);
  } catch (e) {
    for (const f of [`${EXE}.tmp`, `${JSON_FILE}.tmp`]) rmSync(path.join(dir, f), { force: true });
    log(`Couldn't fetch the HomeAgent: ${e instanceof Error ? e.message : String(e)}`);
  }
}
