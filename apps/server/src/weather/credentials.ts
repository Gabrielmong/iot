import { coded } from "../api-errors.js";
import type { ServiceDeps } from "../services/deps.js";
import { required } from "../services/integrations.js";
import { readEncryptedSettings, writeEncryptedSettings } from "../services/settings-store.js";
import { SettingKey } from "../settings-keys.js";
import { WeatherFetchError, type LatLng, type XweatherCredentials } from "./types.js";

type Store = Pick<ServiceDeps, "prisma" | "secretKey">;

const XWEATHER_KEYS = [SettingKey.xweatherClientId, SettingKey.xweatherClientSecret] as const;
/** Where "Test connection" asks for weather before a home location is saved (San José). */
export const SAMPLE_POINT: LatLng = { lat: 9.93, lng: -84.08 };

/** The stored Xweather credentials, decrypted; undefined until both are stored. */
export async function xweatherCredentials(deps: Store): Promise<XweatherCredentials | undefined> {
  const s = await readEncryptedSettings(deps.prisma, deps.secretKey, XWEATHER_KEYS);
  return s && { clientId: s[SettingKey.xweatherClientId], clientSecret: s[SettingKey.xweatherClientSecret] };
}

export async function setXweatherCredentials(deps: Store, clientId: string, clientSecret: string): Promise<void> {
  await writeEncryptedSettings(deps.prisma, deps.secretKey, {
    [SettingKey.xweatherClientId]: required(clientId, "Client ID"),
    [SettingKey.xweatherClientSecret]: required(clientSecret, "Client secret"),
  });
}

/** The stored Google Maps key, decrypted; undefined until stored. */
export async function googleMapsKey(deps: Store): Promise<string | undefined> {
  const s = await readEncryptedSettings(deps.prisma, deps.secretKey, [SettingKey.googleMapsApiKey]);
  return s?.[SettingKey.googleMapsApiKey];
}

export async function setGoogleMapsKey(deps: Store, apiKey: string): Promise<void> {
  await writeEncryptedSettings(deps.prisma, deps.secretKey, { [SettingKey.googleMapsApiKey]: required(apiKey, "API key") });
}

/** Fetches weather once with the stored credentials; throws XWEATHER_FAILED with a reason the admin can act on. */
export async function testXweather(deps: Store & Pick<ServiceDeps, "weatherFetch">, at: LatLng | null): Promise<true> {
  const creds = await xweatherCredentials(deps);
  if (!creds) throw coded("XWEATHER_FAILED", "Save the Xweather credentials first");
  try {
    await deps.weatherFetch(creds, at ?? SAMPLE_POINT);
    return true;
  } catch (error) {
    throw coded("XWEATHER_FAILED", error instanceof WeatherFetchError ? error.message : "Couldn't reach Xweather");
  }
}
