import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { announcedName } from "../src/discovery/announced-name.js";

const prismaWith = (findUnique: () => Promise<unknown>) => ({ setting: { findUnique } }) as unknown as PrismaClient;

describe("announcedName", () => {
  it("returns the stored home name", async () => {
    const log = { warn: vi.fn() };
    await expect(announcedName(prismaWith(async () => ({ value: "Casa" })), log)).resolves.toBe("Casa");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("falls back to Home and warns when the lookup fails", async () => {
    const log = { warn: vi.fn() };
    const name = await announcedName(prismaWith(async () => { throw new Error("db locked"); }), log);
    expect(name).toBe("Home");
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("db locked"));
  });
});
