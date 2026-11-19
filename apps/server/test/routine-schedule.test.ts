import { describe, expect, it } from "vitest";
import { formatTime, isDue, localSlot, parseSchedules, scheduleMinute, slotsBetween, type Schedule } from "../src/routines/schedule.js";

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
    expect(parseSchedules([{ time: "07:30", days: [5, 1, 1, 3] }])).toEqual([{ minuteOfDay: 450, days: [1, 3, 5], enabled: true, anchor: "CLOCK", offsetMinutes: 0 }]);
    expect(parseSchedules([{ time: "23:59", days: [7], enabled: false }])).toEqual([{ minuteOfDay: 1439, days: [7], enabled: false, anchor: "CLOCK", offsetMinutes: 0 }]);
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

  it("parses sunrise and sunset schedules with an offset", () => {
    expect(parseSchedules([{ anchor: "SUNSET", offsetMinutes: -30, days: [1] }])).toEqual([{ minuteOfDay: 0, days: [1], enabled: true, anchor: "SUNSET", offsetMinutes: -30 }]);
    expect(parseSchedules([{ anchor: "SUNRISE", time: null, days: [2] }])[0]).toMatchObject({ anchor: "SUNRISE", offsetMinutes: 0 });
  });

  it("needs a time for clock schedules", () => {
    expect(message(() => parseSchedules([{ anchor: "CLOCK", days: [1] }]))).toBe("Times must be HH:MM");
  });

  it("limits sun offsets to three hours either way", () => {
    for (const offsetMinutes of [181, -181, 1.5]) {
      expect(message(() => parseSchedules([{ anchor: "SUNSET", offsetMinutes, days: [1] }]))).toBe("Offsets must be −180 to 180 minutes");
    }
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
    const s: Schedule = { minuteOfDay: 450, days: [1, 2], enabled: true, anchor: "CLOCK", offsetMinutes: 0 };
    expect(isDue(s, { day: 1, minuteOfDay: 450 })).toBe(true);
    expect(isDue(s, { day: 3, minuteOfDay: 450 })).toBe(false);
    expect(isDue(s, { day: 1, minuteOfDay: 451 })).toBe(false);
    expect(isDue({ ...s, enabled: false }, { day: 1, minuteOfDay: 450 })).toBe(false);
  });
});

describe("scheduleMinute", () => {
  const sun = (anchor: Schedule["anchor"], offsetMinutes = 0): Schedule => ({ minuteOfDay: 0, days: [1], enabled: true, anchor, offsetMinutes });

  it("is the clock time for clock schedules", () => {
    expect(scheduleMinute({ minuteOfDay: 450, days: [1], enabled: true, anchor: "CLOCK", offsetMinutes: 0 }, null)).toBe(450);
  });

  it("is sunset plus the offset", () => {
    expect(scheduleMinute(sun("SUNSET", -30), { sunrise: 330, sunset: 1065 })).toBe(1035);
    expect(scheduleMinute(sun("SUNRISE", 15), { sunrise: 330, sunset: 1065 })).toBe(345);
  });

  it("is never when the offset crosses midnight", () => {
    expect(scheduleMinute(sun("SUNSET", 180), { sunrise: 330, sunset: 1380 })).toBeNull();
    expect(scheduleMinute(sun("SUNRISE", -180), { sunrise: 60, sunset: 1065 })).toBeNull();
  });

  it("is never without sun times (no home location, or polar day)", () => {
    expect(scheduleMinute(sun("SUNSET"), null)).toBeNull();
    expect(scheduleMinute(sun("SUNSET"), { sunrise: 330, sunset: null })).toBeNull();
  });

  it("makes a sun schedule due at its computed minute", () => {
    expect(isDue(sun("SUNSET", -30), { day: 1, minuteOfDay: 1035 }, { sunrise: 330, sunset: 1065 })).toBe(true);
    expect(isDue(sun("SUNSET", -30), { day: 1, minuteOfDay: 1035 }, null)).toBe(false);
  });
});

