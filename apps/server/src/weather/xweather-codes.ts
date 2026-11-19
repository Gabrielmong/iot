import type { WeatherCondition } from "./types.js";

const BY_WEATHER: Record<string, WeatherCondition> = {
  CL: "CLEAR",
  FW: "PARTLY_CLOUDY",
  SC: "PARTLY_CLOUDY",
  BK: "CLOUDY",
  OV: "CLOUDY",
  R: "RAIN",
  RW: "RAIN",
  RS: "RAIN",
  UP: "RAIN",
  L: "DRIZZLE",
  ZL: "DRIZZLE",
  ZR: "RAIN",
  T: "STORM",
  S: "SNOW",
  SW: "SNOW",
  SI: "SNOW",
  IP: "SNOW",
  A: "SNOW",
  WM: "SNOW",
  BS: "SNOW",
  F: "FOG",
  ZF: "FOG",
  IF: "FOG",
  BR: "FOG",
  H: "FOG",
  K: "FOG",
  BD: "FOG",
  BN: "FOG",
  BY: "FOG",
  VA: "FOG",
  WG: "WINDY",
};

/** Maps Xweather's "coverage:intensity:weather" code (e.g. ":L:RW") by its weather part. */
export function conditionFromCode(coded: string | null | undefined): WeatherCondition {
  if (!coded) return "UNKNOWN";
  const weather = coded.slice(coded.lastIndexOf(":") + 1);
  return BY_WEATHER[weather] ?? "UNKNOWN";
}
