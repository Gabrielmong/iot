import { afterEach, describe, expect, it } from 'vitest';
import { setupGovee as setup, teardownGovee } from '../test/govee-harness.js';
import { GoveeTimeoutError } from './errors.js';

afterEach(teardownGovee);


const waitFor = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe('GoveeLan', () => {
  it('emits device for a scan reply (multicast address and unicast target)', async () => {
    const { lan } = await setup();
    const found: unknown[] = [];
    lan.on('device', (d) => found.push(d));
    lan.scan(['127.0.0.1']);
    await waitFor(() => found.length >= 2);
    expect(found[0]).toEqual({ ip: '127.0.0.1', device: 'AA:BB', sku: 'H618C' });
    expect(found).toHaveLength(2);
  });

  it('maps a colour status', async () => {
    const { lan } = await setup({ status: { onOff: 1, brightness: 70, color: { r: 155, g: 89, b: 255 }, colorTemInKelvin: 0 } });
    expect(await lan.status('127.0.0.1')).toEqual({ on: true, brightness: 70, mode: 'color', color: { r: 155, g: 89, b: 255 } });
  });

  it('maps a white status', async () => {
    const { lan } = await setup({ status: { onOff: 0, brightness: 10, color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: 3000 } });
    expect(await lan.status('127.0.0.1')).toEqual({ on: false, brightness: 10, mode: 'white', colorTempK: 3000 });
  });

  it('serializes concurrent status calls to one IP', async () => {
    const { lan, device } = await setup({ status: { onOff: 1, brightness: 5, colorTemInKelvin: 0 }, statusDelayMs: 20 });
    const results = await Promise.all([lan.status('127.0.0.1'), lan.status('127.0.0.1'), lan.status('127.0.0.1')]);
    expect(results.map((r) => r.brightness)).toEqual([5, 5, 5]);
    expect(device.received).toHaveLength(3);
  });

  it('rejects status with GoveeTimeoutError when the device is silent, and keeps working after', async () => {
    const { lan } = await setup({ silent: true }, 100);
    await expect(lan.status('127.0.0.1')).rejects.toBeInstanceOf(GoveeTimeoutError);
    await expect(lan.status('127.0.0.1')).rejects.toBeInstanceOf(GoveeTimeoutError);
  });

  it('sends the documented command payloads', async () => {
    const { lan, device } = await setup();
    await lan.setOn('127.0.0.1', true);
    await lan.setOn('127.0.0.1', false);
    await lan.setBrightness('127.0.0.1', 250);
    await lan.setColor('127.0.0.1', { r: 1, g: 2, b: 300 });
    await lan.setColorTemp('127.0.0.1', 3000);
    await lan.setColorTemp('127.0.0.1', 100);
    await waitFor(() => device.received.length >= 6);
    expect(device.received).toEqual([
      { cmd: 'turn', data: { value: 1 } },
      { cmd: 'turn', data: { value: 0 } },
      { cmd: 'brightness', data: { value: 100 } },
      { cmd: 'colorwc', data: { color: { r: 1, g: 2, b: 255 }, colorTemInKelvin: 0 } },
      { cmd: 'colorwc', data: { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: 3000 } },
      { cmd: 'colorwc', data: { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: 2000 } },
    ]);
  });

  it('can stop and restart, and rejects sends when stopped', async () => {
    const { lan } = await setup();
    await lan.stop();
    await expect(lan.setOn('127.0.0.1', true)).rejects.toThrow('not started');
    await lan.start();
    await lan.setOn('127.0.0.1', true);
  });
});
