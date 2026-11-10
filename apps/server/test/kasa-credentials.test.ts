import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kasaCredentialsFrom } from "../src/devices/kasa-credentials.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { encryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { closeDb, resetDb } from "./helpers.js";

const KEY = Buffer.alloc(32, 3);
let db: PrismaClient;
beforeEach(async () => {
  db = await resetDb();
});
afterAll(closeDb);

describe("kasaCredentialsFrom", () => {
  it("is undefined until both settings exist", async () => {
    await db.setting.create({ data: { key: SettingKey.kasaUsername, value: encryptSecret("me@example.com", KEY) } });
    expect(await kasaCredentialsFrom(db, KEY)()).toBeUndefined();
  });

  it("decrypts the stored username and password", async () => {
    await db.setting.createMany({
      data: [
        { key: "kasa.username", value: encryptSecret("me@example.com", KEY) },
        { key: "kasa.password", value: encryptSecret("pw", KEY) },
      ],
    });
    expect(await kasaCredentialsFrom(db, KEY)()).toEqual({ username: "me@example.com", password: "pw" });
  });

  it("treats undecryptable credentials as missing", async () => {
    await db.setting.createMany({
      data: [
        { key: "kasa.username", value: encryptSecret("me@example.com", Buffer.alloc(32, 9)) },
        { key: "kasa.password", value: encryptSecret("pw", Buffer.alloc(32, 9)) },
      ],
    });
    expect(await kasaCredentialsFrom(db, KEY)()).toBeUndefined();
  });
});
