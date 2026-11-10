import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { closeDb, resetDb } from "./helpers.js";

let db: PrismaClient;
beforeEach(async () => {
  db = await resetDb();
});
afterAll(closeDb);

const device = { brand: "TUYA", kind: "LIGHT", externalId: "abc", name: "Lamp", config: {} } as const;

describe("schema", () => {
  it("rejects duplicate (brand, externalId)", async () => {
    await db.device.create({ data: device });
    await expect(db.device.create({ data: device })).rejects.toThrow();
  });

  it("allows same externalId across brands", async () => {
    await db.device.create({ data: device });
    await expect(db.device.create({ data: { ...device, brand: "KASA" } })).resolves.toBeDefined();
  });

  it("cascades grants when a user is deleted", async () => {
    const user = await db.user.create({
      data: { name: "Ana", avatarColor: "#fff", role: "USER", pinHash: "h" },
    });
    const d = await db.device.create({ data: device });
    await db.deviceGrant.create({ data: { userId: user.id, deviceId: d.id } });
    await db.user.delete({ where: { id: user.id } });
    expect(await db.deviceGrant.count()).toBe(0);
  });
});
