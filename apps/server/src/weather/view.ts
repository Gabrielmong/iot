import type { WeatherState } from "./service.js";
import { sunTimes } from "./sun.js";

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** The weather as the API returns it: never the coordinates; sun times whenever a pin exists; no data while disabled. */
export function toApiWeather(state: WeatherState, now: Date) {
  const sun = state.location ? sunTimes(now, state.location) : null;
  const reading = state.status === "DISABLED" ? null : state.reading;
  return {
    status: state.status,
    updatedAt: iso(reading?.fetchedAt ?? null),
    stale: reading !== null && state.stale,
    current: reading?.current ?? null,
    hourly: (reading?.hourly ?? []).map((h) => ({ ...h, time: h.time.toISOString() })),
    daily: reading?.daily ?? [],
    sun: sun && { sunrise: iso(sun.sunrise), sunset: iso(sun.sunset) },
  };
}
