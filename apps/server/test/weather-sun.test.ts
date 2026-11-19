import { describe, expect, it } from "vitest";
import { isSunUp, localSunMinutes, sunTimes } from "../src/weather/sun.js";

const SAN_JOSE = { lat: 9.93, lng: -84.08 };

describe("sunTimes", () => {
  it("gives San José's sunrise and sunset on the June solstice", () => {
    const { sunrise, sunset } = sunTimes(new Date("2026-06-21T12:00:00-06:00"), SAN_JOSE);
    // 05:10–05:30 and 17:50–18:15 local (UTC−6)
    expect(sunrise!.getTime()).toBeGreaterThanOrEqual(Date.parse("2026-06-21T11:10:00Z"));
    expect(sunrise!.getTime()).toBeLessThanOrEqual(Date.parse("2026-06-21T11:30:00Z"));
    expect(sunset!.getTime()).toBeGreaterThanOrEqual(Date.parse("2026-06-21T23:50:00Z"));
    expect(sunset!.getTime()).toBeLessThanOrEqual(Date.parse("2026-06-22T00:15:00Z"));
  });

  it("gives no sunset during the polar day", () => {
    expect(sunTimes(new Date("2026-06-21T12:00:00Z"), { lat: 80, lng: 0 }).sunset).toBeNull();
  });
});

describe("isSunUp", () => {
  it("is up at local noon and down at local midnight", () => {
    expect(isSunUp(new Date("2026-06-21T12:00:00-06:00"), SAN_JOSE)).toBe(true);
    expect(isSunUp(new Date("2026-06-21T00:00:00-06:00"), SAN_JOSE)).toBe(false);
  });
});

describe("localSunMinutes", () => {
  it("gives sunrise and sunset as local minutes of the day", () => {
    // The scheduler assumes the server runs in the house's timezone; CI runs in UTC, where San José's
    // sunset falls after midnight. Pin the zone so the test checks the conversion, not the machine.
    const original = process.env.TZ;
    process.env.TZ = "America/Costa_Rica";
    try {
      const day = new Date(2026, 5, 21);
      const t = sunTimes(new Date(2026, 5, 21, 12), SAN_JOSE);
      const minute = (d: Date) => d.getHours() * 60 + d.getMinutes();
      expect(localSunMinutes(day, SAN_JOSE)).toEqual({ sunrise: minute(t.sunrise!), sunset: minute(t.sunset!) });
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("is null when the sun doesn't set (polar day)", () => {
    expect(localSunMinutes(new Date(2026, 5, 21), { lat: 78.2, lng: 15.6 })).toEqual({ sunrise: null, sunset: null });
  });
});
