import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPin } from "../src/auth/pin.js";
import { ensureBootstrapAdmin } from "../src/bootstrap-admin.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { closeDb, resetDb } from "./helpers.js";

let db: PrismaClient;
beforeEach(async () => {
  db = await resetDb();
});
afterAll(closeDb);

describe("ensureBootstrapAdmin", () => {
  it("creates Admin with the PIN on an empty database and logs it without the PIN", async () => {
    const log = { info: vi.fn() };
    expect(await ensureBootstrapAdmin(db, "86420", log)).toBe(true);
    const admin = await db.user.findUniqueOrThrow({ where: { name: "Admin" } });
    expect(admin.role).toBe("ADMIN");
    expect(await verifyPin("86420", admin.pinHash)).toBe(true);
    expect(log.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("86420");
  });

  it("does nothing once a user exists, even without a PIN", async () => {
    await ensureBootstrapAdmin(db, "86420", { info: () => {} });
    expect(await ensureBootstrapAdmin(db, undefined, { info: () => {} })).toBe(false);
    expect(await db.user.count()).toBe(1);
  });

  it("requires the PIN when there are no users", async () => {
    await expect(ensureBootstrapAdmin(db, undefined, { info: () => {} })).rejects.toThrow(/BOOTSTRAP_ADMIN_PIN/);
  });
});
