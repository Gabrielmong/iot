import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncAgentExe } from '../src/agent-exe.js';

let root: string;
let dir: string;
let logs: string[];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agent-'));
  dir = path.join(root, 'shared', 'agent');
  logs = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** A release with HomeAgent.exe (asset 1) and agent.json (asset 2). */
function github(version: number | undefined, exe = 'EXE-BYTES', json?: object) {
  const downloads: number[] = [];
  const manifest = json ?? { version, sha256: sha(exe) };
  return {
    downloads,
    gh: {
      latestAgentRelease: async () => (version ? { version, exeAssetId: 1, jsonAssetId: 2 } : undefined),
      downloadAsset: async (id: number) => {
        downloads.push(id);
        return Buffer.from(id === 1 ? exe : JSON.stringify(manifest));
      },
    },
  };
}
const run = (gh: Parameters<typeof syncAgentExe>[0]['github']) => syncAgentExe({ dir, github: gh, log: (m) => logs.push(m) });
const held = (version: number, exe = 'OLD') => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'HomeAgent.exe'), exe);
  writeFileSync(path.join(dir, 'agent.json'), JSON.stringify({ version, sha256: sha(exe) }));
};
const heldJson = () => JSON.parse(readFileSync(path.join(dir, 'agent.json'), 'utf8'));

describe('syncAgentExe', () => {
  it('a newer release replaces both files', async () => {
    held(1001);
    await run(github(1002).gh);
    expect(readFileSync(path.join(dir, 'HomeAgent.exe'), 'utf8')).toBe('EXE-BYTES');
    expect(heldJson()).toEqual({ version: 1002, sha256: sha('EXE-BYTES') });
    expect(readdirSync(dir).sort()).toEqual(['HomeAgent.exe', 'agent.json']);
    expect(logs.join('\n')).toContain('1002');
  });

  it('downloads when nothing is held, creating the folder', async () => {
    await run(github(1001).gh);
    expect(heldJson().version).toBe(1001);
  });

  it('the same or an older version does nothing', async () => {
    held(1002);
    const same = github(1002);
    await run(same.gh);
    const older = github(1001);
    await run(older.gh);
    expect([...same.downloads, ...older.downloads]).toEqual([]);
    expect(readFileSync(path.join(dir, 'HomeAgent.exe'), 'utf8')).toBe('OLD');
  });

  it('a hash mismatch keeps the old pair and logs', async () => {
    held(1001);
    await run(github(1002, 'EXE-BYTES', { version: 1002, sha256: sha('something else') }).gh);
    expect(readFileSync(path.join(dir, 'HomeAgent.exe'), 'utf8')).toBe('OLD');
    expect(heldJson().version).toBe(1001);
    expect(readdirSync(dir).sort()).toEqual(['HomeAgent.exe', 'agent.json']);
    expect(logs.join('\n')).toMatch(/SHA-256/);
  });

  it('a manifest whose version differs from the tag keeps the old pair', async () => {
    held(1001);
    await run(github(1002, 'EXE-BYTES', { version: 1003, sha256: sha('EXE-BYTES') }).gh);
    expect(heldJson().version).toBe(1001);
    expect(logs.join('\n')).toMatch(/version/);
  });

  it('a failing download keeps the old pair and logs', async () => {
    held(1001);
    await run({
      latestAgentRelease: async () => ({ version: 1002, exeAssetId: 1, jsonAssetId: 2 }),
      downloadAsset: async () => {
        throw new Error('boom');
      },
    });
    expect(readFileSync(path.join(dir, 'HomeAgent.exe'), 'utf8')).toBe('OLD');
    expect(logs.join('\n')).toContain('boom');
  });

  it('re-downloads when agent.json is there but the exe is missing', async () => {
    held(1002);
    rmSync(path.join(dir, 'HomeAgent.exe'));
    const { gh, downloads } = github(1002);
    await run(gh);
    expect(downloads.sort()).toEqual([1, 2]);
    expect(existsSync(path.join(dir, 'HomeAgent.exe'))).toBe(true);
  });
});
