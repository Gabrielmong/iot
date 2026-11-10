import { describe, expect, it } from "vitest";
import { formatTime, isDue, localSlot, parseSchedules, slotsBetween } from "../src/routines/schedule.js";

const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return null;
};

describe("parseSchedules", () => {
  it("parses HH:MM and sorts unique days", () => {
    expect(parseSchedules([{ time: "07:30", days: [5, 1, 1, 3] }])).toEqual([{ minuteOfDay: 450, days: [1, 3, 5], enabled: true }]);
    expect(parseSchedules([{ time: "23:59", days: [7], enabled: false }])).toEqual([{ minuteOfDay: 1439, days: [7], enabled: false }]);
  });

  it("rejects bad times", () => {
    for (const time of ["7:5", "24:00", "12:60", "noon"]) expect(message(() => parseSchedules([{ time, days: [1] }]))).toBe("Times must be HH:MM");
  });

  it("rejects missing or out-of-range days", () => {
    for (const days of [[], [0], [8]]) expect(message(() => parseSchedules([{ time: "07:00", days }]))).toBe("Pick days from Monday (1) to Sunday (7)");
  });

  it("allows at most 10 schedule rows", () => {
    const row = { time: "07:00", days: [1] };
    expect(parseSchedules(Array(10).fill(row))).toHaveLength(10);
    expect(message(() => parseSchedules(Array(11).fill(row)))).toBe("A routine can have at most 10 schedules");
  });

  it("formats minutes back to HH:MM", () => {
    expect(formatTime(450)).toBe("07:30");
    expect(formatTime(0)).toBe("00:00");
  });
});

describe("slots", () => {
  it("maps a local date to weekday and minute (Monday = 1, Sunday = 7)", () => {
    expect(localSlot(new Date(2026, 10, 9, 7, 30, 59))).toEqual({ day: 1, minuteOfDay: 450, key: "2026-11-09 07:30" });
    expect(localSlot(new Date(2026, 10, 15, 0, 0))).toMatchObject({ day: 7, minuteOfDay: 0 });
  });

  it("lists every minute after `from` up to `to`", () => {
    const slots = slotsBetween(new Date(2026, 10, 9, 7, 0, 59), new Date(2026, 10, 9, 7, 2, 1));
    expect(slots.map((s) => s.key)).toEqual(["2026-11-09 07:01", "2026-11-09 07:02"]);
  });

  it("returns nothing within the same minute", () => {
    expect(slotsBetween(new Date(2026, 10, 9, 7, 1, 2), new Date(2026, 10, 9, 7, 1, 40))).toEqual([]);
  });

  it("caps a long gap at the last 5 minutes", () => {
    const slots = slotsBetween(new Date(2026, 10, 9, 5, 0), new Date(2026, 10, 9, 7, 0, 10));
    expect(slots.map((s) => s.key)).toEqual(["2026-11-09 06:56", "2026-11-09 06:57", "2026-11-09 06:58", "2026-11-09 06:59", "2026-11-09 07:00"]);
  });

  it("isDue matches minute and weekday on enabled rows only", () => {
    const s = { minuteOfDay: 450, days: [1, 2], enabled: true };
    expect(isDue(s, { day: 1, minuteOfDay: 450 })).toBe(true);
    expect(isDue(s, { day: 3, minuteOfDay: 450 })).toBe(false);
    expect(isDue(s, { day: 1, minuteOfDay: 451 })).toBe(false);
    expect(isDue({ ...s, enabled: false }, { day: 1, minuteOfDay: 450 })).toBe(false);
  });
});
