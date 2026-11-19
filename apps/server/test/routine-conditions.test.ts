import { describe, expect, it } from "vitest";
import { describeConditions, evaluate, parseConditions, type Condition } from "../src/routines/conditions.js";
import type { WeatherFacts } from "../src/weather/service.js";
import type { WeatherReading } from "../src/weather/types.js";
import { SAMPLE_WEATHER } from "./fixtures/weather.js";

const SAN_JOSE = { lat: 9.93, lng: -84.08 };
const NOW = new Date(2026, 10, 18, 14, 0);
const reading = (over: Partial<WeatherReading["current"]> = {}, rest: Partial<WeatherReading> = {}): WeatherReading => ({
  ...SAMPLE_WEATHER,
  current: { ...SAMPLE_WEATHER.current, ...over },
  fetchedAt: NOW,
  lat: SAN_JOSE.lat,
  lng: SAN_JOSE.lng,
  ...rest,
});
const facts = (r: WeatherReading | null, now = NOW, location: WeatherFacts["location"] = SAN_JOSE): WeatherFacts => ({ reading: r, location, now });
const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return null;
};

const hotAndRaining: Condition[] = [
  { metric: "TEMP_C", op: "ABOVE", value: 28 },
  { metric: "RAINING_NOW", op: "IS" },
];

describe("parseConditions", () => {
  it("needs 1 to 5 conditions", () => {
    expect(message(() => parseConditions([]))).toBe("Add 1 to 5 conditions");
    const six = Array.from({ length: 6 }, () => ({ metric: "TEMP_C", op: "ABOVE", value: 20 }));
    expect(message(() => parseConditions(six))).toBe("Add 1 to 5 conditions");
  });

  it("rejects a check that doesn't fit the metric", () => {
    expect(message(() => parseConditions([{ metric: "RAINING_NOW", op: "ABOVE", value: 1 }]))).toBe("That check doesn't fit");
    expect(message(() => parseConditions([{ metric: "NOPE", op: "IS" }]))).toBe("That check doesn't fit");
    expect(message(() => parseConditions([{ metric: "constructor", op: "ABOVE", value: 1 }]))).toBe("That check doesn't fit");
    expect(message(() => parseConditions([{ metric: "toString", op: "IS" }]))).toBe("That check doesn't fit");
  });

  it("needs a value for numeric metrics, within range", () => {
    expect(message(() => parseConditions([{ metric: "TEMP_C", op: "ABOVE" }]))).toBe("Enter a value");
    expect(message(() => parseConditions([{ metric: "TEMP_C", op: "ABOVE", value: 61 }]))).toBe("Temperature must be from -50 to 60");
    expect(message(() => parseConditions([{ metric: "HUMIDITY", op: "BELOW", value: 101 }]))).toBe("Humidity must be from 0 to 100");
  });

  it("drops the value for checks that take none", () => {
    expect(parseConditions([{ metric: "SUN", op: "IS_UP", value: 3 }])).toEqual([{ metric: "SUN", op: "IS_UP" }]);
    expect(parseConditions([{ metric: "TEMP_C", op: "BELOW", value: 18 }])).toEqual([{ metric: "TEMP_C", op: "BELOW", value: 18 }]);
  });
});

describe("evaluate", () => {
  it("compares strictly", () => {
    expect(evaluate([{ metric: "TEMP_C", op: "ABOVE", value: 28 }], facts(reading({ tempC: 29 })))).toBe(true);
    expect(evaluate([{ metric: "TEMP_C", op: "ABOVE", value: 28 }], facts(reading({ tempC: 28 })))).toBe(false);
  });

  it("needs every condition", () => {
    expect(evaluate(hotAndRaining, facts(reading({ tempC: 30, raining: true })))).toBe(true);
    expect(evaluate(hotAndRaining, facts(reading({ tempC: 30, raining: false })))).toBe(false);
  });

  it("is unknown without a reading", () => {
    expect(evaluate([{ metric: "TEMP_C", op: "ABOVE", value: 28 }], facts(null))).toBe("UNKNOWN");
  });

  it("checks the sun from the location alone", () => {
    const midnight = new Date(2026, 10, 18, 0, 0);
    expect(evaluate([{ metric: "SUN", op: "IS_DOWN" }], facts(null, midnight))).toBe(true);
    expect(evaluate([{ metric: "SUN", op: "IS_DOWN" }], facts(null, midnight, null))).toBe("UNKNOWN");
  });

  it("takes the highest rain chance of the hours left today", () => {
    const hour = (h: number, rainChance: number) => ({ time: new Date(2026, 10, 18, h), tempC: 20, condition: "CLOUDY" as const, rainChance });
    const hourly = [hour(13, 90), hour(15, 40), hour(18, 70), hour(23, 10)];
    const tomorrow = { ...hour(0, 95), time: new Date(2026, 10, 19, 1) };
    const r = reading({}, { hourly: [...hourly, tomorrow], daily: [{ date: "2026-11-18", minC: 18, maxC: 26, condition: "RAIN", rainChance: 99 }] });
    expect(evaluate([{ metric: "RAIN_CHANCE_TODAY", op: "ABOVE", value: 69 }], facts(r))).toBe(true);
    expect(evaluate([{ metric: "RAIN_CHANCE_TODAY", op: "ABOVE", value: 70 }], facts(r))).toBe(false);
  });

  it("falls back to today's forecast without hours left", () => {
    const r = reading({}, { hourly: [], daily: [{ date: "2026-11-18", minC: 18, maxC: 26, condition: "RAIN", rainChance: 60 }] });
    expect(evaluate([{ metric: "RAIN_CHANCE_TODAY", op: "ABOVE", value: 50 }], facts(r))).toBe(true);
  });
});

describe("describeConditions", () => {
  it("reads like a sentence", () => {
    expect(describeConditions(hotAndRaining)).toBe("temperature above 28° and raining now");
  });
});
