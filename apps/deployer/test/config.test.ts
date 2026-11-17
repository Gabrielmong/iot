import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, pathsFor, readAppEnv } from '../src/config.js';

const bin = { node: 'n', pnpm: 'p', git: 'g', nssm: 'ns', pgDump: 'pd', powershell: 'ps', tar: 't' };
const minimal = {
  root: 'C:\\H',
  githubRepo: 'o/r',
  tokenFile: 't',
  apiTokenFile: 'a',
  bin,
  installedDeployerTree: 'abc',
};

function tmpFile(name: string, content: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'deployer-')), name);
  writeFileSync(file, content);
  return file;
}

describe('loadConfig', () => {
  it('fills defaults', () => {
    const cfg = loadConfig(tmpFile('c.json', JSON.stringify(minimal)));
    expect(cfg).toMatchObject({
      pollMs: 120000,
      ciTimeoutMs: 1800000,
      keepReleases: 5,
      keepBackups: 10,
      maxEvents: 50,
      healthTimeoutMs: 60000,
      apiPort: 4100,
      branch: 'main',
      serviceName: 'HomeControl',
      ciWorkflowName: 'CI',
      ciIdlePollMs: 20000,
      ciActivePollMs: 5000,
      ciKeepCommits: 50,
    });
  });

  it('fills step timeouts, keeping any the file overrides', () => {
    const cfg = loadConfig(tmpFile('c.json', JSON.stringify({ ...minimal, stepTimeoutsMs: { build: 60000 } })));
    expect(cfg.stepTimeoutsMs).toEqual({
      fetch: 300000,
      export: 300000,
      helpers: 600000,
      install: 1800000,
      build: 60000,
      protect: 300000,
      backup: 900000,
      migrate: 600000,
      settings: 120000,
    });
    expect(loadConfig(tmpFile('c.json', JSON.stringify(minimal))).stepTimeoutsMs.build).toBe(1800000);
  });

  it('names missing keys', () => {
    const { githubRepo: _omit, ...rest } = minimal;
    expect(() => loadConfig(tmpFile('c.json', JSON.stringify(rest)))).toThrow(/githubRepo/);
  });
});

describe('pathsFor', () => {
  it('joins under the root with windows separators', () => {
    const p = pathsFor('C:\\H');
    expect(p.current).toBe('C:\\H\\current');
    expect(p.ci).toMatch(/^C:.H.deployer.ci.json$/);
    expect(p.ciLogs).toMatch(/^C:.H.deployer.ci-logs$/);
    expect(p.envFile).toBe('C:\\H\\shared\\.env');
    expect(pathsFor('C:\\HomeControl').android).toBe('C:\\HomeControl\\shared\\android');
    expect(p.history).toBe('C:\\H\\deployer\\history.json');
    expect(p.backups).toBe('C:\\H\\deployer\\backups');
  });
});

describe('readAppEnv', () => {
  it('parses a dotenv file', () => {
    expect(readAppEnv(tmpFile('.env', 'A=1\nB="two"\n'))).toEqual({ A: '1', B: 'two' });
  });

  it('names the path when the file is missing', () => {
    const missing = path.join(tmpdir(), 'deployer-nope', '.env');
    expect(() => readAppEnv(missing)).toThrow(missing);
  });
});
