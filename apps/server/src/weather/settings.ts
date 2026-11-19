import { badInput } from "../api-errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { LatLng } from "./types.js";

/** The household's weather options: the pin, how often to fetch, when data is too old to trust, and the on/off switch. */
export type WeatherOptions = { lat: number | null; lng: number | null; address: string | null; refreshMinutes: number; staleMinutes: number; enabled: boolean };

const ID = "home";
export const DEFAULT_OPTIONS: WeatherOptions = { lat: null, lng: null, address: null, refreshMinutes: 15, staleMinutes: 45, enabled: true };
const REFRESH = { min: 5, max: 120 };
const MAX_STALE = 720;

export async function readWeatherOptions(prisma: PrismaClient): Promise<WeatherOptions> {
  const row = await prisma.weatherSettings.findUnique({ where: { id: ID } });
  if (!row) return { ...DEFAULT_OPTIONS };
  const { lat, lng, address, refreshMinutes, staleMinutes, enabled } = row;
  return { lat, lng, address, refreshMinutes, staleMinutes, enabled };
}

const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

function validate(input: WeatherOptions): WeatherOptions {
  const { lat, lng, refreshMinutes, staleMinutes, enabled } = input;
  if ((lat === null) !== (lng === null)) throw badInput("Set both latitude and longitude, or neither");
  if (lat !== null && !inRange(lat, -90, 90)) throw badInput("Latitude must be -90 to 90");
  if (lng !== null && !inRange(lng, -180, 180)) throw badInput("Longitude must be -180 to 180");
  if (!Number.isInteger(refreshMinutes) || !inRange(refreshMinutes, REFRESH.min, REFRESH.max)) throw badInput(`Refresh every ${REFRESH.min} to ${REFRESH.max} minutes`);
  if (!Number.isInteger(staleMinutes) || !inRange(staleMinutes, refreshMinutes, MAX_STALE)) throw badInput(`Stale-after must be from the refresh interval up to ${MAX_STALE} minutes`);
  const address = input.address?.trim() || null;
  return { lat, lng, address: lat === null ? null : address, refreshMinutes, staleMinutes, enabled };
}

export async function updateWeatherOptions(prisma: PrismaClient, input: WeatherOptions): Promise<WeatherOptions> {
  const data = validate(input);
  await prisma.weatherSettings.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
  return data;
}

/** The pin, or null until one is set. */
export function locationOf(o: Pick<WeatherOptions, "lat" | "lng">): LatLng | null {
  return o.lat === null || o.lng === null ? null : { lat: o.lat, lng: o.lng };
}
