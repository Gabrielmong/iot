import { GoveeLan } from '../govee/client.js';
import { FakeGoveeDevice, type FakeGoveeOptions } from './fake-govee-device.js';

const open: { stop(): Promise<void> }[] = [];

/** Stops every client and fake created by `setupGovee`; call from afterEach. */
export async function teardownGovee(): Promise<void> {
  await Promise.all(open.splice(0).map((x) => x.stop()));
}

/** A started GoveeLan wired to a fake device on localhost. `timeout` undefined keeps the default. */
export async function setupGovee(fake: FakeGoveeOptions = {}, timeout?: number) {
  const device = new FakeGoveeDevice(fake);
  await device.start();
  const lan = new GoveeLan({
    bindAddress: '127.0.0.1',
    listenPort: 0,
    devicePort: device.devicePort,
    scanPort: device.scanPort,
    multicastAddress: '127.0.0.1',
    statusTimeoutMs: timeout,
  });
  await lan.start();
  device.replyPort = lan.listenPort;
  open.push(lan, device);
  return { lan, device };
}
