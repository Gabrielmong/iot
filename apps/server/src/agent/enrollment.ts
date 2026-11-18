import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { EnrollInput } from "./enroll-input.js";
import { newSecret, sha256Hex } from "./tokens.js";

export const ENROLLMENT_MS = 30 * 60_000;

/** A one-time "Adopt this PC" code; only its hash is stored. */
export async function createEnrollment(prisma: PrismaClient, userId: string, now: Date): Promise<{ code: string; expiresAt: Date }> {
  const code = newSecret(16);
  const expiresAt = new Date(now.getTime() + ENROLLMENT_MS);
  await prisma.agentEnrollment.create({ data: { codeHash: sha256Hex(code), createdById: userId, expiresAt } });
  return { code, expiresAt };
}

/** True while the code can still be redeemed (or downloaded with). */
export async function enrollmentValid(prisma: PrismaClient, code: string, now: Date): Promise<boolean> {
  const row = await prisma.agentEnrollment.findUnique({ where: { codeHash: sha256Hex(code) } });
  return !!row && !row.usedAt && row.expiresAt > now;
}

type Config = { mac?: string; macs?: string[]; [k: string]: unknown };
type Tx = Prisma.TransactionClient;

/** The WOL computer one of these MACs belongs to: the wake MAC's owner first, then any other. */
async function matchComputer(tx: Tx, input: EnrollInput) {
  const computers = await tx.device.findMany({ where: { brand: "WOL", kind: "COMPUTER" } });
  const macsOf = (d: (typeof computers)[number]) => {
    const c = (d.config ?? {}) as Config;
    return new Set([d.externalId, c.mac, ...(c.macs ?? [])]);
  };
  return computers.find((d) => macsOf(d).has(input.wakeMac)) ?? computers.find((d) => input.macs.some((m) => macsOf(d).has(m))) ?? null;
}

/**
 * Redeems a code: attaches the agent to the PC with one of its MACs (keeping its name, room and grants) or
 * adds a new adopted PC named after the host. A PC that already had an agent gets the new token (re-pair).
 */
export async function redeemEnrollment(prisma: PrismaClient, input: EnrollInput, now: Date): Promise<{ deviceId: string; token: string } | "gone"> {
  const token = newSecret(32);
  const agentTokenHash = sha256Hex(token);
  return prisma.$transaction(async (tx) => {
    const used = await tx.agentEnrollment.updateMany({
      where: { codeHash: sha256Hex(input.code), usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (used.count !== 1) return "gone" as const;
    const existing = await matchComputer(tx, input);
    const old = (existing?.config ?? {}) as Config;
    const config = { ...old, mac: input.wakeMac, macs: [...new Set([...(old.macs ?? []), ...input.macs])] };
    const fields = { externalId: input.wakeMac, ip: input.ips[0] ?? existing?.ip ?? null, config, agentTokenHash, agentVersion: input.agentVersion };
    const device = existing
      ? await tx.device.update({ where: { id: existing.id }, data: fields })
      : await tx.device.create({ data: { brand: "WOL", kind: "COMPUTER", adopted: true, name: input.hostname, ...fields } });
    return { deviceId: device.id, token };
  });
}
