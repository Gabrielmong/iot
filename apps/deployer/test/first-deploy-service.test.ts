import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  forgetServiceSettings,
  loadServiceSettings,
  saveServiceSettings,
  savedSettingsFile,
  writeServiceSettings,
} from '../src/first-deploy-service.js';
import { type Fixture, setup } from './op-fixture.js';

let f: Fixture;
beforeEach(() => {
  f = setup();
});
afterEach(() => f.cleanup());

const nssmCalls = () => f.sys.calls.filter((c) => c.cmd === 'nssm').map((c) => c.args);

describe('first-deploy service settings', () => {
  it('saves the six settings read with nssm get', async () => {
    expect(await saveServiceSettings(f.ctx)).toBe('saved');
    expect(nssmCalls()).toEqual(
      ['Application', 'AppParameters', 'AppDirectory', 'AppEnvironmentExtra', 'AppStdout', 'AppStderr'].map((k) => [
        'get',
        'HomeControl',
        k,
      ]),
    );
    expect(JSON.parse(readFileSync(savedSettingsFile(f.paths), 'utf8'))).toEqual(f.service);
    expect(loadServiceSettings(f.paths)).toEqual(f.service);
  });

  it('keeps settings an earlier first deploy saved', async () => {
    mkdirSync(f.paths.data, { recursive: true });
    writeFileSync(savedSettingsFile(f.paths), JSON.stringify({ ...f.service, AppDirectory: ['C:\\original'] }));
    expect(await saveServiceSettings(f.ctx)).toBe('kept');
    expect(nssmCalls()).toEqual([]);
    expect(loadServiceSettings(f.paths)!.AppDirectory).toEqual(['C:\\original']);
  });

  it('saves nothing when the service does not exist', async () => {
    f.sys.serviceState = 'missing';
    expect(await saveServiceSettings(f.ctx)).toBe('no service');
    expect(existsSync(savedSettingsFile(f.paths))).toBe(false);
  });

  it('writes each setting back with nssm set, and resets an empty one', async () => {
    await writeServiceSettings(f.ctx, f.service as never);
    expect(nssmCalls()).toEqual([
      ['set', 'HomeControl', 'Application', 'C:\\Program Files\\nodejs\\node.exe'],
      ['set', 'HomeControl', 'AppParameters', 'apps/server/dist/main.js'],
      ['set', 'HomeControl', 'AppDirectory', 'C:\\home-control'],
      ['set', 'HomeControl', 'AppEnvironmentExtra', 'NODE_ENV=production', 'GO2RTC_PATH=C:\\home-control\\tools\\go2rtc.exe'],
      ['set', 'HomeControl', 'AppStdout', 'C:\\home-control\\logs\\out.log'],
      ['reset', 'HomeControl', 'AppStderr'],
    ]);
  });

  it('loads nothing from a missing or corrupt file, and forgets it', async () => {
    expect(loadServiceSettings(f.paths)).toBeUndefined();
    mkdirSync(f.paths.data, { recursive: true });
    writeFileSync(savedSettingsFile(f.paths), '{ not json');
    expect(loadServiceSettings(f.paths)).toBeUndefined();
    forgetServiceSettings(f.paths);
    expect(existsSync(savedSettingsFile(f.paths))).toBe(false);
  });
});
