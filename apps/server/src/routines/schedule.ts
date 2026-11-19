import { badInput } from "../api-errors.js";

export type ScheduleAnchor = "CLOCK" | "SUNRISE" | "SUNSET";
export type ScheduleInput = {
  time?: string | null;
  days: number[];
  enabled?: boolean | null;
  anchor?: ScheduleAnchor | null;
  offsetMinutes?: number | null;
};
/** minuteOfDay in server local time (0 for sun anchors); offsetMinutes shifts a sun anchor; days 1 = Monday … 7 = Sunday. */
export type Schedule = { minuteOfDay: number; days: number[]; enabled: boolean; anchor: ScheduleAnchor; offsetMinutes: number };
/** Local minute of day of sunrise and sunset; null when there's no home location or the sun doesn't rise/set that day. */
export type SunMinutes = { sunrise: number | null; sunset: number | null };
export type Slot = { day: number; minuteOfDay: number; key: string };

export const MAX_SCHEDULES = 10;
const MAX_CATCH_UP_MINUTES = 5;
const MINUTE_MS = 60_000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_OFFSET = 180;
const MINUTES_PER_DAY = 1440;

export function parseSchedules(input: ScheduleInput[]): Schedule[] {
  if (input.length > MAX_SCHEDULES) throw badInput(`A routine can have at most ${MAX_SCHEDULES} schedules`);
  return input.map((s) => {
    const anchor = s.anchor ?? "CLOCK";
    const clock = anchor === "CLOCK";
    const minuteOfDay = clock ? parseTime(s.time) : 0;
    const offsetMinutes = clock ? 0 : parseOffset(s.offsetMinutes);
    const days = [...new Set(s.days)].sort((a, b) => a - b);
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw badInput("Pick days from Monday (1) to Sunday (7)");
    return { minuteOfDay, days, enabled: s.enabled ?? true, anchor, offsetMinutes };
  });
}

function parseTime(time: string | null | undefined): number {
  const match = TIME.exec(time ?? "");
  if (!match) throw badInput("Times must be HH:MM");
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseOffset(offset: number | null | undefined): number {
  const o = offset ?? 0;
  if (!Number.isInteger(o) || Math.abs(o) > MAX_OFFSET) throw badInput("Offsets must be −180 to 180 minutes");
  return o;
}

/** The local minute a schedule fires on a day with these sun times; null if it doesn't fire that day (no sun data, or the offset crosses midnight). */
export function scheduleMinute(s: Schedule, sun: SunMinutes | null): number | null {
  if (s.anchor === "CLOCK") return s.minuteOfDay;
  const base = s.anchor === "SUNRISE" ? sun?.sunrise : sun?.sunset;
  if (base === null || base === undefined) return null;
  const m = base + s.offsetMinutes;
  return m >= 0 && m < MINUTES_PER_DAY ? m : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const formatTime = (minuteOfDay: number) => `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;

/** The local-time minute a date falls in. */
export function localSlot(d: Date): Slot {
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { day: d.getDay() === 0 ? 7 : d.getDay(), minuteOfDay, key: `${date} ${formatTime(minuteOfDay)}` };
}

/** Every local minute after `from`'s minute up to and including `to`'s, at most the last 5. */
export function slotsBetween(from: Date, to: Date): Slot[] {
  const start = Math.floor(from.getTime() / MINUTE_MS) + 1;
  const end = Math.floor(to.getTime() / MINUTE_MS);
  const first = Math.max(start, end - MAX_CATCH_UP_MINUTES + 1);
  const slots: Slot[] = [];
  for (let m = first; m <= end; m++) slots.push(localSlot(new Date(m * MINUTE_MS)));
  return slots;
}

export const isDue = (s: Schedule, slot: Pick<Slot, "day" | "minuteOfDay">, sun: SunMinutes | null = null) =>
  s.enabled && s.days.includes(slot.day) && scheduleMinute(s, sun) === slot.minuteOfDay;

/** The local midnight of a slot's date. */
export function slotDate(slot: Slot): Date {
  const [y, m, d] = slot.key.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
