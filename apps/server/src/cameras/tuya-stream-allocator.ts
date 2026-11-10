import { TuyaCloudAuthError, TuyaCloudStreamUnavailableError, type TuyaCloud } from "@home/protocols";
import type { TuyaCloudCredentials } from "../services/deps.js";
import type { StreamAllocator } from "./cloud-allocation.js";

export type StreamCloudFactory = (creds: TuyaCloudCredentials) => Pick<TuyaCloud, "allocateStream">;

/**
 * Allocates cloud streams with the stored Tuya credentials, read on every call so a change in
 * Integrations applies at once. The client (and so its access token) is kept while they are unchanged.
 * No credentials stored means no cloud stream (an account refusal, like rejected credentials).
 */
export function tuyaStreamAllocator(credentials: () => Promise<TuyaCloudCredentials | undefined>, factory: StreamCloudFactory): StreamAllocator {
  let cached: { key: string; client: Pick<TuyaCloud, "allocateStream"> } | undefined;
  return async (tuyaId, type) => {
    const creds = await credentials();
    if (!creds) throw new TuyaCloudStreamUnavailableError({ cause: new TuyaCloudAuthError("Tuya cloud credentials are not set") });
    const key = JSON.stringify([creds.accessId, creds.accessSecret, creds.region]);
    if (cached?.key !== key) cached = { key, client: factory(creds) };
    return cached.client.allocateStream(tuyaId, type);
  };
}
