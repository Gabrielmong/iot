import { SwannAuthError, SwannNoStreamsError, SwannUnreachableError } from "@home/protocols";
import { isIPv4 } from "node:net";
import { badInput, coded } from "../api-errors.js";
import { SettingKey } from "../settings-keys.js";
import type { ServiceDeps } from "./deps.js";
import { writeEncryptedSettings } from "./settings-store.js";
import { markSynced, SyncTimeKey } from "./sync-times.js";

export type SwannProbeSummary = { channels: number; codecs: string[] };

/**
 * Probes the recorder with the given login; only when that finds cameras are the host, login and probe
 * result stored (encrypted), after which the drivers are re-synced. Error messages never include the password.
 */
export async function setSwannRecorder(
  deps: Pick<ServiceDeps, "prisma" | "secretKey" | "manager" | "swannProbe" | "now">,
  input: { host: string; username: string; password: string },
): Promise<SwannProbeSummary> {
  const host = input.host.trim();
  const username = input.username.trim();
  if (!isIPv4(host)) throw badInput("Enter an IPv4 address");
  if (!username) throw badInput("Username is required");
  if (!input.password) throw badInput("Password is required");

  const probe = await probeOrThrow(deps, host, { username, password: input.password });
  await writeEncryptedSettings(deps.prisma, deps.secretKey, {
    [SettingKey.swannHost]: host,
    [SettingKey.swannUsername]: username,
    [SettingKey.swannPassword]: input.password,
    [SettingKey.swannProbe]: JSON.stringify(probe),
  });
  await deps.manager.refresh();
  await markSynced(deps.prisma, SyncTimeKey.swann, deps.now());
  return { channels: probe.channels.length, codecs: [...new Set(probe.channels.map((c) => c.codec))] };
}

async function probeOrThrow(deps: Pick<ServiceDeps, "swannProbe">, host: string, creds: { username: string; password: string }) {
  try {
    return await deps.swannProbe(host, creds);
  } catch (e) {
    if (e instanceof SwannAuthError) throw coded("SWANN_AUTH_FAILED", "The recorder rejected that username or password");
    if (e instanceof SwannUnreachableError) throw coded("SWANN_UNREACHABLE", "The recorder did not answer at that address");
    if (e instanceof SwannNoStreamsError) throw coded("SWANN_NO_STREAMS", "The recorder answered but no camera streams were found");
    throw e;
  }
}
