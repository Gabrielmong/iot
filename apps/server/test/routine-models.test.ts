import { afterAll, describe, expect, it } from "vitest";
import { closeDb, resetDb } from "./helpers.js";

afterAll(closeDb);

const user = (db: Awaited<ReturnType<typeof resetDb>>, name: string) =>
  db.user.create({ data: { name, role: "USER", avatarColor: "#123456", pinHash: "x" } });

describe("routine models", () => {
  it("deleting a user deletes their personal routines and audience rows", async () => {
    const db = await resetDb();
    const ann = await user(db, "Ann");
    const personal = await db.routine.create({ data: { name: "Mine", scope: "PERSONAL", ownerId: ann.id, steps: [] } });
    const shared = await db.routine.create({ data: { name: "Ours", scope: "SHARED", steps: [], audience: { create: [{ userId: ann.id }] } } });
    await db.user.delete({ where: { id: ann.id } });
    expect(await db.routine.findUnique({ where: { id: personal.id } })).toBeNull();
    expect(await db.routine.findUnique({ where: { id: shared.id } })).not.toBeNull();
    expect(await db.routineAudience.count({ where: { routineId: shared.id } })).toBe(0);
  });

  it("deleting a room makes its routines whole-house", async () => {
    const db = await resetDb();
    const room = await db.room.create({ data: { name: "Den", sortOrder: 0 } });
    const r = await db.routine.create({ data: { name: "Den lights", scope: "SHARED", roomId: room.id, steps: [] } });
    await db.room.delete({ where: { id: room.id } });
    expect((await db.routine.findUniqueOrThrow({ where: { id: r.id } })).roomId).toBeNull();
  });
});
