import { badInput } from "../../api-errors.js";
import type { ServiceDeps, TuyaCloudClient } from "../../services/deps.js";
import { tuyaCloudCredentials } from "../../services/integrations.js";

type Cached = { key: string; client: TuyaCloudClient };
/** One client per app and credentials, so its access token is reused across commands (each new one costs a round trip). */
const clients = new WeakMap<object, Cached>();

/** The Tuya cloud client for the stored credentials; BAD_USER_INPUT when none are stored. */
export async function cameraCloud(deps: Pick<ServiceDeps, "prisma" | "secretKey" | "tuyaCloud">): Promise<TuyaCloudClient> {
  const creds = await tuyaCloudCredentials(deps);
  if (!creds) throw badInput("Set the Tuya cloud credentials first");
  const key = JSON.stringify(creds);
  const cached = clients.get(deps.tuyaCloud);
  if (cached?.key === key) return cached.client;
  const client = deps.tuyaCloud(creds);
  clients.set(deps.tuyaCloud, { key, client });
  return client;
}
