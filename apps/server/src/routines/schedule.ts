import { badInput } from "../api-errors.js";

export type ScheduleInput = { time: string; days: number[]; enabled?: boolean | null };
/** minuteOfDay in server local time; days 1 = Monday … 7 = Sunday. */
export type Schedule = { minuteOfDay: number; days: number[]; enabled: boolean };
export type Slot = { day: number; minuteOfDay: number; key: string };

export const MAX_SCHEDULES = 10;
const MAX_CATCH_UP_MINUTES = 5;
const MINUTE_MS = 60_000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseSchedules(input: ScheduleInput[]): Schedule[] {
  if (input.length > MAX_SCHEDULES) throw badInput(`A routine can have at most ${MAX_SCHEDULES} schedules`);
  return input.map((s) => {
    const match = TIME.exec(s.time);
    if (!match) throw badInput("Times must be HH:MM");
    const days = [...new Set(s.days)].sort((a, b) => a - b);
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw badInput("Pick days from Monday (1) to Sunday (7)");
    return { minuteOfDay: Number(match[1]) * 60 + Number(match[2]), days, enabled: s.enabled ?? true };
  });
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

export const isDue = (s: Schedule, slot: Pick<Slot, "day" | "minuteOfDay">) => s.enabled && s.minuteOfDay === slot.minuteOfDay && s.days.includes(slot.day);
