import { TuyaClient, type TuyaVersion } from "@home/protocols";

/** Who to look for: a Tuya device's address, id and local key. */
export type TuyaPresenceTarget = { ip: string; externalId: string; localKey: string; version: TuyaVersion };

/**
 * Whether the real device answers at `ip`: a LAN session that only completes with its local key, then a
 * status reply that decrypts with it. On 3.4/3.5 the session-key handshake HMACs our fresh nonce, so this
 * is a live proof. On 3.1/3.3 there is no nonce, so a captured reply could be replayed: callers must not
 * rely on it alone (setCameraOnvif also wants the admin to confirm the address). Never throws.
 */
export async function tuyaPresent(target: TuyaPresenceTarget, opts: { timeoutMs?: number; port?: number } = {}): Promise<boolean> {
  const client = new TuyaClient({ ip: target.ip, id: target.externalId, localKey: target.localKey, version: target.version, timeoutMs: opts.timeoutMs ?? 3000, port: opts.port });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.getDps();
    return true;
  } catch {
    return false;
  } finally {
    client.removeAllListeners();
    client.on("error", () => {}); // late errors from a closing client are irrelevant
    client.close();
  }
}
