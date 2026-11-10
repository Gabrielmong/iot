import type { TuyaCloudDevice, TuyaVersion } from "@home/protocols";
import type { ServiceDeps } from "./deps.js";

type Deps = Pick<ServiceDeps, "prisma" | "manager" | "tuyaPortScan" | "tuyaPresence">;

/** Newest first: most quiet devices are recent firmware. 3.1 is left out (its replies are not encrypted, so they prove nothing). */
const VERSIONS: readonly TuyaVersion[] = ["3.5", "3.4", "3.3"];

/**
 * Cloud devices that are online but not reachable here: unknown locally, or known but neither
 * broadcasting since the server started nor online.
 */
async function quietDevices(deps: Deps, cloud: TuyaCloudDevice[]): Promise<TuyaCloudDevice[]> {
  const candidates = cloud.filter((cd) => cd.localKey && cd.online !== false);
  if (candidates.length === 0) return [];
  const rows = await deps.prisma.device.findMany({ where: { brand: "TUYA", externalId: { in: candidates.map((cd) => cd.id) } } });
  const byExternalId = new Map(rows.map((r) => [r.externalId, r]));
  return candidates.filter((cd) => {
    const row = byExternalId.get(cd.id);
    if (!row) return true;
    if (deps.manager.observedConfig("TUYA", cd.id)) return false;
    return !deps.manager.getState(row.id).online;
  });
}

/**
 * Some Tuya devices never send the LAN discovery broadcast, so they are never recorded. This tries
 * each quiet cloud device's local key against the LAN hosts accepting Tuya connections that are
 * not already some other known device, one connection at a time per host. A host only answers a
 * status read with its own device's key, so a match identifies the device. Each match is recorded
 * as a sighting (creating the device, or moving a known one to its new address); returns their names.
 */
export async function findQuietTuyaDevices(deps: Deps, cloud: TuyaCloudDevice[]): Promise<string[]> {
  const wanted = await quietDevices(deps, cloud);
  if (wanted.length === 0) return [];
  const wantedIds = new Set(wanted.map((cd) => cd.id));
  const taken = await deps.prisma.device.findMany({ where: { ip: { not: null } }, select: { ip: true, brand: true, externalId: true } });
  const takenIps = new Set(taken.filter((d) => !(d.brand === "TUYA" && wantedIds.has(d.externalId))).map((d) => d.ip));
  const hosts = (await deps.tuyaPortScan()).filter((ip) => !takenIps.has(ip));

  const remaining = new Set(wanted);
  const found: { cd: TuyaCloudDevice; ip: string; version: TuyaVersion }[] = [];
  await Promise.all(
    hosts.map(async (ip) => {
      for (const cd of wanted) {
        for (const version of VERSIONS) {
          if (!remaining.has(cd)) break;
          if (await deps.tuyaPresence({ ip, externalId: cd.id, localKey: cd.localKey, version })) {
            remaining.delete(cd);
            found.push({ cd, ip, version });
            return;
          }
        }
      }
    }),
  );

  for (const { cd, ip, version } of found) {
    await deps.manager.recordDiscovered({ brand: "TUYA", externalId: cd.id, ip, name: cd.name || undefined, config: { version } });
  }
  return found.map(({ cd }) => cd.name || cd.id);
}
