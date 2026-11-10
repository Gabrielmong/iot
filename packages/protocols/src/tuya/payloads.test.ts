import { describe, expect, it } from 'vitest';
import { tuyaVectors } from '../test/tuya-vectors.js';
import type { TuyaVersion } from '../types.js';
import { TuyaCmd } from './constants.js';
import { commandsFor, controlPayload, extractDps, heartbeatPayload, queryPayload } from './payloads.js';

const DEV_ID = 'device0123456789abcd';
const T = 1700000000;

function vector(version: TuyaVersion, kind: 'DP_QUERY' | 'CONTROL') {
  const v = tuyaVectors.find((x) => x.version === version && x.kind === kind);
  if (!v) throw new Error(`no vector ${version} ${kind}`);
  return v;
}

const versions: TuyaVersion[] = ['3.1', '3.3', '3.4', '3.5'];

describe('payload builders match tinytuya', () => {
  it.each(versions)('DP_QUERY %s', (version) => {
    const v = vector(version, 'DP_QUERY');
    expect(commandsFor(version).query).toBe(v.cmd);
    expect(queryPayload(version, DEV_ID, T).toString('hex')).toBe(v.payloadHex);
  });

  it.each(versions)('CONTROL %s', (version) => {
    const v = vector(version, 'CONTROL');
    expect(commandsFor(version).control).toBe(v.cmd);
    expect(controlPayload(version, DEV_ID, { '20': true }, T).toString('hex')).toBe(v.payloadHex);
  });

  it('builds the heartbeat payload', () => {
    expect(heartbeatPayload(DEV_ID).toString()).toBe(`{"gwId":"${DEV_ID}","devId":"${DEV_ID}"}`);
  });

  it('uses the *_NEW commands on 3.4/3.5 only', () => {
    expect(commandsFor('3.3')).toEqual({ query: TuyaCmd.DP_QUERY, control: TuyaCmd.CONTROL });
    expect(commandsFor('3.5')).toEqual({ query: TuyaCmd.DP_QUERY_NEW, control: TuyaCmd.CONTROL_NEW });
  });
});

describe('extractDps', () => {
  it('reads top-level dps (3.1/3.3 shape)', () => {
    expect(extractDps(Buffer.from('{"devId":"x","dps":{"20":true}}'))).toEqual({ '20': true });
  });

  it('reads data.dps (3.4/3.5 shape)', () => {
    expect(extractDps(Buffer.from('{"protocol":4,"t":1,"data":{"dps":{"22":500}}}'))).toEqual({ '22': 500 });
  });

  it('returns undefined for JSON without dps', () => {
    expect(extractDps(Buffer.from('{"devId":"x"}'))).toBeUndefined();
  });

  it('throws on a payload that is not JSON', () => {
    expect(() => extractDps(Buffer.from([0xde, 0xad]))).toThrow();
  });
});
