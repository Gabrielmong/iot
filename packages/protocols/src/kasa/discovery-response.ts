/** The identity fields of a UDP 20002 discovery reply. */
export interface KasaDiscoveryInfo {
  deviceId: string;
  model: string;
}

/**
 * Parses a 20002 reply as python-kasa's `Discover._get_discovery_json`: a 16-byte header, then
 * `{"result": {...}}` JSON. Returns undefined for anything without `device_id` and `device_model`.
 */
export function parseDiscoveryResponse(data: Buffer): KasaDiscoveryInfo | undefined {
  let json: unknown;
  try {
    json = JSON.parse(data.subarray(16).toString('utf8'));
  } catch {
    return undefined;
  }
  const result = (json as { result?: { device_id?: unknown; device_model?: unknown } } | null)?.result;
  if (typeof result?.device_id !== 'string' || typeof result.device_model !== 'string') return undefined;
  return { deviceId: result.device_id, model: result.device_model };
}
