import { PubSub } from "graphql-subscriptions";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { FakeKasaDevice } from "../../../packages/protocols/src/test/fake-kasa-device.js";
import { FakeTuyaDevice } from "../../../packages/protocols/src/test/fake-tuya-device.js";
import { KasaDriver } from "../src/devices/drivers/kasa.js";
import { TuyaDriver } from "../src/devices/drivers/tuya.js";
import { DeviceManager } from "../src/devices/manager.js";
import type { Driver } from "../src/devices/types.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { encryptSecret } from "../src/secrets.js";
import { silentLog } from "./api-harness.js";
import { closeDb, resetDb } from "./helpers.js";

/** setDeviceState answers with manager.getState() right after the driver resolves, so that must be the new state. */
const KEY = Buffer.alloc(32, 7);
const LOCAL_KEY = "0123456789abcdef";
const CREDS = { username: "me@example.com", password: "pw" };

let manager: DeviceManager | undefined;
let closeFake: (() => Promise<void>) | undefined;
afterEach(async () => {
  await manager?.stop();
  await closeFake?.();
  manager = closeFake = undefined;
});
afterAll(closeDb);

async function startManager(db: PrismaClient, driver: Driver): Promise<DeviceManager> {
  manager = new DeviceManager(db, [driver], new PubSub(), KEY, { log: silentLog });
  await manager.start();
  return manager;
}

describe("DeviceManager state right after a successful command", () => {
  it("is the patched state for a Kasa outlet, before any poll", async () => {
    const fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", children: [{ id: "D100", alias: "Lamp", state: 0 }] });
    closeFake = () => fake.close();
    const db = await resetDb();
    const lamp = await db.device.create({
      data: { brand: "KASA", kind: "PLUG", externalId: "D1:D100", name: "Lamp", ip: "127.0.0.1", adopted: true, config: {} },
    });
    const driver = new KasaDriver({ credentials: async () => CREDS, discover: async () => [], port: fake.port, pollIntervalMs: 60_000 });
    const m = await startManager(db, driver);
    await vi.waitFor(() => expect(m.getState(lamp.id)).toEqual({ online: true, on: false }));

    await m.setState(lamp.id, { on: true });

    expect(m.getState(lamp.id)).toEqual({ online: true, on: true });
  });

  it("is the patched state for a Tuya switch whose STATUS push has not arrived", async () => {
    const fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: { "1": false }, noStatusOnControl: true });
    closeFake = () => fake.close();
    const db = await resetDb();
    const sw = await db.device.create({
      data: {
        brand: "TUYA", kind: "SWITCH", externalId: "tuya1", name: "Switch", ip: "127.0.0.1", adopted: true,
        config: { version: "3.3" }, secret: encryptSecret(LOCAL_KEY, KEY),
      },
    });
    const driver = new TuyaDriver({ port: fake.port, startDiscovery: async () => ({ stop: async () => {} }) });
    const m = await startManager(db, driver);
    await vi.waitFor(() => expect(m.getState(sw.id)).toEqual({ online: true, on: false }));

    await m.setState(sw.id, { on: true });

    expect(m.getState(sw.id)).toEqual({ online: true, on: true });
  });
});
