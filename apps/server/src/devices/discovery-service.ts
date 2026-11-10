import type { Device, Prisma, PrismaClient } from "../generated/prisma/client.js";
import { asObject } from "../json.js";
import { SightingThrottle } from "./sighting-throttle.js";
import type { Brand, DeviceKind, Discovered, StreamSource } from "./types.js";

export type DiscoveryOutcome = { created: boolean; ipChanged: boolean };

type Sighting = { brand: Brand; externalId: string; ip: string; name: string; kind?: DeviceKind; model?: string; config?: Record<string, unknown>; streamSource?: StreamSource };

/**
 * Persists discovery results: unknown `(brand, externalId)` → new non-adopted Device (children get
 * `parentId`); known → `ip`, `lastSeenAt`, `model` and `config` updated. Name and room are the
 * user's and are never overwritten; `kind` is only filled in while it is UNKNOWN; `streamSource` is
 * only set on create.
 *
 * Threat model: sightings (Tuya broadcasts, Govee scan replies, Kasa discovery) are unauthenticated
 * and anyone on the LAN can spoof them.
 * - Config: once a device is adopted, its config is locked. A sighting may only add fields it lacks,
 *   and never changes existing ones. This stops a spoofed broadcast from downgrading the Tuya
 *   protocol version (for example 3.4 → 3.1).
 * - IP: IP changes are always accepted, because DHCP moves devices. The link at the new IP still
 *   authenticates: the Tuya 3.4/3.5 handshake HMAC, 3.3 replies that must decrypt with the local key,
 *   and KLAP auth for Kasa. So a spoofer can only cause a temporary KEY_INVALID or offline state until
 *   the real device is seen again. Govee has no LAN authentication at all.
 */
export class DiscoveryService {
  private readonly throttle: SightingThrottle;
  /** The config each device announced in its latest sighting, adopted or not (e.g. its Tuya version). */
  private readonly observed = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.throttle = new SightingThrottle(() => this.now().getTime());
  }

  async record(d: Discovered): Promise<DiscoveryOutcome> {
    if (d.config) this.observed.set(observedKey(d.brand, d.externalId), d.config);
    if (this.throttle.isRepeat(d)) return { created: false, ipChanged: false };
    const name = d.name ?? d.model ?? `${d.brand} ${d.externalId}`;
    const parent = await this.upsert({ ...d, name }, null);
    const outcome = { created: parent.created, ipChanged: parent.ipChanged };
    for (const child of d.children ?? []) {
      const c = await this.upsert({ brand: d.brand, externalId: child.externalId, ip: d.ip, name: child.name, kind: d.kind, model: d.model }, parent.id);
      outcome.created ||= c.created;
      outcome.ipChanged ||= c.ipChanged;
    }
    this.throttle.markWritten(d);
    return outcome;
  }

  /** The config from the latest sighting. Unauthenticated: callers may only use it to move a value forward. */
  observedConfig(brand: Brand, externalId: string): Record<string, unknown> | undefined {
    return this.observed.get(observedKey(brand, externalId));
  }

  /** After a removal, so the removed devices are recorded again on their next sighting. */
  forgetSightings(): void {
    this.throttle.clear();
  }

  private async upsert(s: Sighting, parentId: string | null): Promise<DiscoveryOutcome & { id: string }> {
    const where = { brand_externalId: { brand: s.brand, externalId: s.externalId } };
    const existing = await this.prisma.device.findUnique({ where });
    const lastSeenAt = this.now();
    if (!existing) {
      const created = await this.prisma.device.create({
        data: {
          brand: s.brand,
          externalId: s.externalId,
          kind: s.kind ?? "UNKNOWN",
          name: s.name,
          model: s.model,
          ip: s.ip,
          parentId,
          config: (s.config ?? {}) as Prisma.InputJsonObject,
          streamSource: s.streamSource,
          lastSeenAt,
        },
      });
      return { id: created.id, created: true, ipChanged: false };
    }
    await this.prisma.device.update({
      where,
      data: {
        ip: s.ip,
        lastSeenAt,
        model: s.model ?? existing.model,
        kind: existing.kind === "UNKNOWN" && s.kind ? s.kind : undefined,
        config: s.config ? (mergeConfig(existing, s.config) as Prisma.InputJsonObject) : undefined,
      },
    });
    return { id: existing.id, created: false, ipChanged: existing.ip !== s.ip };
  }
}

const observedKey = (brand: Brand, externalId: string) => `${brand}:${externalId}`;

/** Adopted: existing fields win (locked at adoption). Not adopted: the latest sighting wins. */
function mergeConfig(existing: Device, sighted: Record<string, unknown>): Record<string, unknown> {
  const current = asObject(existing.config);
  return existing.adopted ? { ...sighted, ...current } : { ...current, ...sighted };
}
