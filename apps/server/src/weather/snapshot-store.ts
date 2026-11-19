import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { HourlyWeather, WeatherData, WeatherReading } from "./types.js";

const ID = "home";

type StoredData = Omit<WeatherData, "hourly"> & { hourly: (Omit<HourlyWeather, "time"> & { time: string })[] };

/** The last reading saved, or null. */
export async function loadSnapshot(prisma: PrismaClient): Promise<WeatherReading | null> {
  const row = await prisma.weatherSnapshot.findUnique({ where: { id: ID } });
  if (!row) return null;
  const data = row.data as unknown as StoredData;
  return { ...data, hourly: data.hourly.map((h) => ({ ...h, time: new Date(h.time) })), fetchedAt: row.fetchedAt, lat: row.lat, lng: row.lng };
}

export async function saveSnapshot(prisma: PrismaClient, r: WeatherReading): Promise<void> {
  const stored: StoredData = { current: r.current, daily: r.daily, hourly: r.hourly.map((h) => ({ ...h, time: h.time.toISOString() })) };
  const data = stored as unknown as Prisma.InputJsonValue;
  const row = { fetchedAt: r.fetchedAt, lat: r.lat, lng: r.lng, data };
  await prisma.weatherSnapshot.upsert({ where: { id: ID }, create: { id: ID, ...row }, update: row });
}
