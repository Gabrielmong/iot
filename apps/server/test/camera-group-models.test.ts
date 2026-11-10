import { afterAll, describe, expect, it } from "vitest";
import { closeDb, resetDb } from "./helpers.js";

afterAll(closeDb);

type Db = Awaited<ReturnType<typeof resetDb>>;
const user = (db: Db, name: string) => db.user.create({ data: { name, role: "USER", avatarColor: "#123456", pinHash: "x" } });
const camera = (db: Db, n: number) => db.device.create({ data: { brand: "SWANN", kind: "CAMERA", externalId: `cam-${n}`, name: `Cam ${n}`, adopted: true, config: {} } });

describe("camera group models", () => {
  it("deleting a camera removes it from groups", async () => {
    const db = await resetDb();
    const [a, b] = [await camera(db, 1), await camera(db, 2)];
    const g = await db.cameraGroup.create({
      data: { name: "Front", scope: "SHARED", layout: 4, members: { create: [{ deviceId: a.id, position: 0 }, { deviceId: b.id, position: 1 }] } },
    });
    await db.device.delete({ where: { id: a.id } });
    expect((await db.cameraGroupMember.findMany({ where: { groupId: g.id } })).map((m) => m.deviceId)).toEqual([b.id]);
  });

  it("deleting a user deletes their personal groups and audience rows", async () => {
    const db = await resetDb();
    const ann = await user(db, "Ann");
    const mine = await db.cameraGroup.create({ data: { name: "Mine", scope: "PERSONAL", ownerId: ann.id, layout: 4 } });
    const shared = await db.cameraGroup.create({ data: { name: "Ours", scope: "SHARED", layout: 4, audience: { create: [{ userId: ann.id }] } } });
    await db.user.delete({ where: { id: ann.id } });
    expect(await db.cameraGroup.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await db.cameraGroupAudience.count({ where: { groupId: shared.id } })).toBe(0);
  });
});
