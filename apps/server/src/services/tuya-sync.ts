import type { TuyaCloudDevice } from "@home/protocols";
import { badInput } from "../api-errors.js";
import { tuyaKindFromCategory } from "../devices/drivers/tuya-kind.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "./deps.js";
import { tuyaCloudCredentials } from "./integrations.js";
import { markSynced, SyncTimeKey } from "./sync-times.js";
import { tuyaCloudApiError } from "./tuya-cloud-errors.js";
import { applyTuyaKey } from "./tuya-keys.js";
import { findQuietTuyaDevices } from "./tuya-quiet.js";

/** `found`: devices that never broadcast, located on the LAN by this sync (also counted in `matched`). */
export type SyncResult = { matched: number; unmatched: string[]; found: string[] };

/**
 * The app's only cloud contact: fetches local keys, categories and DP schemas from the Tuya cloud
 * and stores them on the devices seen on the LAN (matched by id = broadcast gwId). Online cloud devices
 * that never broadcast are first looked for on the LAN by key. Cloud devices still not found locally
 * are returned by name.
 */
export function syncTuyaKeys(deps: ServiceDeps): Promise<SyncResult> {
  const running = inFlight.get(deps);
  if (running) return running;
  const run = runSync(deps).finally(() => inFlight.delete(deps));
  inFlight.set(deps, run);
  return run;
}

/** One sync at a time per app: a manual sync during a scheduled one (or vice versa) shares its result. */
const inFlight = new WeakMap<ServiceDeps, Promise<SyncResult>>();

async function runSync(deps: ServiceDeps): Promise<SyncResult> {
  const creds = await tuyaCloudCredentials(deps);
  if (!creds) throw badInput("Set the Tuya cloud credentials first");
  let cloudDevices: TuyaCloudDevice[];
  try {
    cloudDevices = await deps.tuyaCloud(creds).listDevices();
  } catch (err) {
    throw tuyaCloudApiError(err);
  }

  const found = await findQuietTuyaDevices(deps, cloudDevices);
  const result: SyncResult = { matched: 0, unmatched: [], found };
  for (const cd of cloudDevices) {
    const where = { brand_externalId: { brand: "TUYA" as const, externalId: cd.id } };
    const extras = { kind: tuyaKindFromCategory(cd.category), dpSchema: cd.dpSchema, category: cd.category || undefined, name: cd.name || undefined, cameraFeatures: cd.cameraFeatures };
    if (await applyTuyaKey(deps, where, cd.localKey, extras)) result.matched++;
    else result.unmatched.push(cd.name || cd.id);
  }

  if (result.matched > 0) {
    await deps.manager.refresh();
    await publishDevicesChanged(deps.pubsub);
  }
  await markSynced(deps.prisma, SyncTimeKey.tuya, deps.now());
  return result;
}
