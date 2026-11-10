export const SAMSUNG_INFO_PORT = 8001;

export interface SamsungInfo {
  /** `device.duid` without `uuid:`; stable across IP changes. */
  id: string;
  name: string;
  modelName: string;
  /** `wifiMac`, or `wiredMac` for a TV on Ethernet, as the TV writes it. */
  wifiMac?: string;
  /** Newer models only: `on` or `standby`. */
  powerState?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Parses `/api/v2/`; throws when it isn't a Samsung TV's answer. */
export function parseSamsungInfo(json: unknown): SamsungInfo {
  const device = (json as { device?: Record<string, unknown> } | null)?.device;
  const duid = str(device?.duid) ?? str(device?.id);
  if (!device || !duid) throw new Error('Not a Samsung TV');
  return {
    id: duid.replace(/^uuid:/i, ''),
    name: str(device.name) ?? 'Samsung TV',
    modelName: str(device.modelName) ?? '',
    wifiMac: str(device.wifiMac) ?? str(device.wiredMac),
    powerState: str(device.PowerState) ?? str(device.powerState),
  };
}

const MAX_INFO_BYTES = 64 * 1024;

/** GET http://<ip>:8001/api/v2/; rejects when the TV doesn't answer (off, or a pre-2016 model). */
export async function fetchSamsungInfo(ip: string, opts: { port?: number; timeoutMs?: number } = {}): Promise<SamsungInfo> {
  const res = await fetch(`http://${ip}:${opts.port ?? SAMSUNG_INFO_PORT}/api/v2/`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 2000), redirect: 'error' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_INFO_BYTES) throw new Error('Answer too large');
    chunks.push(chunk);
  }
  return parseSamsungInfo(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
