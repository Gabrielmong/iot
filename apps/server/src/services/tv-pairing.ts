import { badInput, notFound } from "../api-errors.js";
import { deviceUnreachable } from "../devices/command-errors.js";
import { PairingRejectedError, WrongPairingCodeError } from "../devices/errors.js";
import type { PairingMode } from "../devices/types.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import { encryptSecret } from "../secrets.js";
import type { ServiceDeps } from "./deps.js";
import { deviceRow, type DeviceRow } from "./device-rows.js";

type Deps = Pick<ServiceDeps, "prisma" | "pubsub" | "manager" | "secretKey" | "tvPairings" | "log">;

/** Opens a pairing exchange with the TV; an earlier open one is cancelled, one still opening is shared. */
export async function startTvPairing(deps: Deps, deviceId: string): Promise<PairingMode> {
  let session;
  try {
    session = await deps.tvPairings.start(deviceId, () => deps.manager.tv.startPairing(deviceId));
  } catch (err) {
    if (err instanceof Error && "extensions" in err) throw err; // already an API error (not a TV, not found)
    deps.log.warn(`tv ${deviceId}: pairing could not start: ${err instanceof Error ? err.message : String(err)}`);
    throw deviceUnreachable(deviceId);
  }
  return session.mode;
}

/**
 * Completes the pending pairing. A wrong code keeps the session open for another try; success stores
 * the TV's secret (encrypted) and marks it OK.
 */
export async function finishTvPairing(deps: Deps, deviceId: string, code?: string | null): Promise<DeviceRow> {
  const session = deps.tvPairings.get(deviceId);
  if (!session) throw badInput("Pairing expired — start again");
  let secret: string;
  try {
    secret = await session.finish(code?.trim() || undefined);
  } catch (err) {
    if (err instanceof WrongPairingCodeError) throw badInput("Wrong code — check the TV and try again");
    deps.tvPairings.cancel(deviceId);
    if (err instanceof PairingRejectedError) throw badInput("The TV refused the pairing");
    deps.log.warn(`tv ${deviceId}: pairing failed: ${err instanceof Error ? err.message : String(err)}`);
    throw deviceUnreachable(deviceId);
  }
  deps.tvPairings.take(deviceId);
  await deps.prisma.device.update({ where: { id: deviceId }, data: { secret: encryptSecret(secret, deps.secretKey), status: "OK" } });
  await deps.manager.refresh();
  await publishDevicesChanged(deps.pubsub);
  const row = await deviceRow(deps.prisma, deviceId);
  if (!row) throw notFound("Device");
  return row;
}

/** Drops the pending pairing, if any. */
export function cancelTvPairing(deps: Pick<ServiceDeps, "tvPairings">, deviceId: string): boolean {
  deps.tvPairings.cancel(deviceId);
  return true;
}
