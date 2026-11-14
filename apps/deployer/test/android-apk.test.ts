import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncAndroidApk } from '../src/android-apk.js';

let root: string;
let dir: string;
let logs: string[];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'apk-'));
  dir = path.join(root, 'shared', 'android');
  logs = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function github(release: { versionCode: number; assetId: number } | undefined, bytes = 'APK-BYTES') {
  const downloads: number[] = [];
  return {
    downloads,
    gh: {
      latestAndroidRelease: async () => release,
      downloadAsset: async (id: number) => {
        downloads.push(id);
        return Buffer.from(bytes);
      },
    },
  };
}
const run = (gh: Parameters<typeof syncAndroidApk>[0]['github']) =>
  syncAndroidApk({ dir, github: gh, log: (m) => logs.push(m) });
const held = (versionCode: number, apk = 'OLD') => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'home.apk'), apk);
  writeFileSync(path.join(dir, 'home.json'), JSON.stringify({ versionCode }));
};

describe('syncAndroidApk', () => {
  it('downloads when nothing is held, creating the folder', async () => {
    const { gh, downloads } = github({ versionCode: 5, assetId: 77 });
    await run(gh);
    expect(downloads).toEqual([77]);
    expect(readFileSync(path.join(dir, 'home.apk'), 'utf8')).toBe('APK-BYTES');
    expect(JSON.parse(readFileSync(path.join(dir, 'home.json'), 'utf8'))).toEqual({ versionCode: 5 });
    expect(readdirSync(dir).sort()).toEqual(['home.apk', 'home.json']);
  });

  it('skips when the held version is the same or newer', async () => {
    held(5);
    const { gh, downloads } = github({ versionCode: 5, assetId: 1 });
    await run(gh);
    held(9);
    await run(github({ versionCode: 5, assetId: 1 }).gh);
    expect(downloads).toEqual([]);
    expect(readFileSync(path.join(dir, 'home.apk'), 'utf8')).toBe('OLD');
  });

  it('replaces with a newer release, leaving only the pair', async () => {
    held(5);
    await run(github({ versionCode: 6, assetId: 2 }).gh);
    expect(readFileSync(path.join(dir, 'home.apk'), 'utf8')).toBe('APK-BYTES');
    expect(JSON.parse(readFileSync(path.join(dir, 'home.json'), 'utf8'))).toEqual({ versionCode: 6 });
    expect(readdirSync(dir).sort()).toEqual(['home.apk', 'home.json']);
  });

  it('a failing download leaves the previous pair and logs', async () => {
    held(5);
    await run({
      latestAndroidRelease: async () => ({ versionCode: 6, assetId: 2 }),
      downloadAsset: async () => {
        throw new Error('boom');
      },
    });
    expect(readFileSync(path.join(dir, 'home.apk'), 'utf8')).toBe('OLD');
    expect(JSON.parse(readFileSync(path.join(dir, 'home.json'), 'utf8'))).toEqual({ versionCode: 5 });
    expect(readdirSync(dir).sort()).toEqual(['home.apk', 'home.json']);
    expect(logs.join('\n')).toContain('boom');
  });

  it('does nothing when there is no release', async () => {
    await run(github(undefined).gh);
    expect(existsSync(path.join(dir, 'home.apk'))).toBe(false);
  });

  it('re-downloads when home.json is there but home.apk is missing', async () => {
    held(5);
    rmSync(path.join(dir, 'home.apk'));
    const { gh, downloads } = github({ versionCode: 5, assetId: 3 });
    await run(gh);
    expect(downloads).toEqual([3]);
    expect(existsSync(path.join(dir, 'home.apk'))).toBe(true);
  });

  it('a hanging download that aborts leaves the previous pair and logs', async () => {
    held(5);
    const ac = new AbortController();
    const pending = run({
      latestAndroidRelease: async () => ({ versionCode: 6, assetId: 2 }),
      downloadAsset: () =>
        new Promise<Buffer>((_, reject) => ac.signal.addEventListener('abort', () => reject(new Error('timed out')))),
    });
    setTimeout(() => ac.abort(), 10);
    await pending;
    expect(readFileSync(path.join(dir, 'home.apk'), 'utf8')).toBe('OLD');
    expect(logs.join('\n')).toContain('timed out');
  });
});
