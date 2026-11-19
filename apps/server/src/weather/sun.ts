import SunCalc from "suncalc";
import type { LatLng } from "./types.js";

const valid = (d: Date) => (Number.isNaN(d.getTime()) ? null : d);

/** Sunrise and sunset on the day containing `day`; null when the sun doesn't rise or set (polar day / night). */
export function sunTimes(day: Date, at: LatLng): { sunrise: Date | null; sunset: Date | null } {
  const t = SunCalc.getTimes(day, at.lat, at.lng);
  return { sunrise: valid(t.sunrise), sunset: valid(t.sunset) };
}

/** Whether the sun's top edge is above the horizon at `now`. */
export function isSunUp(now: Date, at: LatLng): boolean {
  // Sunrise/sunset are defined at -0.833° (refraction and the sun's radius).
  return SunCalc.getPosition(now, at.lat, at.lng).altitude > (-0.833 * Math.PI) / 180;
}

const sameLocalDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const minuteOn = (d: Date | null, day: Date) => (d && sameLocalDay(d, day) ? d.getHours() * 60 + d.getMinutes() : null);

/** Sunrise and sunset as local minutes of `day`; null when one doesn't happen on that local day. */
export function localSunMinutes(day: Date, at: LatLng): { sunrise: number | null; sunset: number | null } {
  const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const t = sunTimes(noon, at);
  return { sunrise: minuteOn(t.sunrise, noon), sunset: minuteOn(t.sunset, noon) };
}
