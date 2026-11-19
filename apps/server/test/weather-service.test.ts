import { PubSub } from "graphql-subscriptions";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { WEATHER_UPDATED } from "../src/devices/topics.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { setXweatherCredentials } from "../src/weather/credentials.js";
import { WeatherService } from "../src/weather/service.js";
import { updateWeatherOptions, DEFAULT_OPTIONS } from "../src/weather/settings.js";
import { WeatherFetchError, type LatLng, type WeatherData } from "../src/weather/types.js";
import { KEY } from "./api-harness.js";
import { closeDb, resetDb } from "./helpers.js";

const MINUTE = 60_000;
const DATA: WeatherData = {
  current: { tempC: 24, feelsLikeC: 25, humidity: 70, windKph: 10, condition: "CLEAR", isDay: true, precipMm: 0, raining: false },
  hourly: [],
  daily: [],
};

let db: PrismaClient;
let time: number;
let timers: { fn: () => void; ms: number; cancelled: boolean }[];
let calls: LatLng[];
let fail: Error | null;
let published: number;

beforeEach(async () => {
  db = await resetDb();
  time = Date.parse("2026-11-18T12:00:00Z");
  timers = [];
  calls = [];
  fail = null;
  published = 0;
});
afterAll(closeDb);

function service() {
  const pubsub = new PubSub();
  void pubsub.subscribe(WEATHER_UPDATED, () => void published++);
  return new WeatherService({
    prisma: db,
    secretKey: KEY,
    pubsub,
    now: () => new Date(time),
    log: { warn: () => {}, error: () => {} },
    fetch: async (_creds, at) => {
      calls.push(at);
      if (fail) throw fail;
      return DATA;
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return { cancel: () => void (t.cancelled = true) };
    },
  });
}

const configure = () => setXweatherCredentials({ prisma: db, secretKey: KEY }, "id", "secret");
const pin = (lat: number, lng: number, more: Partial<typeof DEFAULT_OPTIONS> = {}) => updateWeatherOptions(db, { ...DEFAULT_OPTIONS, lat, lng, ...more });

describe("WeatherService status", () => {
  it("is NOT_CONFIGURED without credentials", async () => {
    await pin(1, 1);
    const s = service();
    await s.start();
    expect(s.state().status).toBe("NOT_CONFIGURED");
    s.stop();
  });

  it("is NO_LOCATION without a pin", async () => {
    await configure();
    const s = service();
    await s.start();
    expect(s.state().status).toBe("NO_LOCATION");
    s.stop();
  });

  it("is DISABLED and never fetches when switched off", async () => {
    await configure();
    await pin(1, 1, { enabled: false });
    const s = service();
    await s.start();
    await s.refreshNow();
    expect(s.state().status).toBe("DISABLED");
    expect(calls).toEqual([]);
    s.stop();
  });
});

describe("WeatherService fetching", () => {
  it("fetches, saves the snapshot and publishes", async () => {
    await configure();
    await pin(1, 1);
    const s = service();
    await s.start();
    await s.refreshNow();
    expect(s.state()).toMatchObject({ status: "OK", stale: false, lastError: null });
    expect(s.state().reading?.current.tempC).toBe(24);
    expect(await db.weatherSnapshot.count()).toBe(1);
    expect(published).toBeGreaterThan(0);
    s.stop();
  });

  it("shows the saved reading after a restart before fetching again", async () => {
    await configure();
    await pin(1, 1);
    const first = service();
    await first.start();
    await first.refreshNow();
    first.stop();
    fail = new WeatherFetchError("down", false);
    const second = service();
    await second.start();
    expect(second.state().reading?.current.tempC).toBe(24);
    second.stop();
  });

  it("drops the old pin's reading when the pin moves and fetches for the new one", async () => {
    await configure();
    await pin(1, 1);
    const s = service();
    await s.start();
    await s.refreshNow();
    await pin(2, 2);
    fail = new WeatherFetchError("down", false);
    await s.reconfigure();
    expect(s.state().reading).toBeNull();
    expect(s.facts().reading).toBeNull();
    expect(calls.at(-1)).toEqual({ lat: 2, lng: 2 });
    s.stop();
  });

  it("keeps the last reading on errors, reports them, and goes stale on time", async () => {
    await configure();
    await pin(1, 1);
    const s = service();
    await s.start();
    await s.refreshNow();
    fail = new WeatherFetchError("Xweather rejected the credentials", true);
    await s.refreshNow();
    expect(s.state()).toMatchObject({ status: "ERROR", lastError: "Xweather rejected the credentials", stale: false });
    expect(s.state().reading?.current.tempC).toBe(24);
    expect(s.facts().reading).not.toBeNull();
    time += 46 * MINUTE;
    expect(s.state().stale).toBe(true);
    expect(s.facts().reading).toBeNull();
    s.stop();
  });

  it("re-arms every refresh interval", async () => {
    await configure();
    await pin(1, 1, { refreshMinutes: 20, staleMinutes: 60 });
    const s = service();
    await s.start();
    const live = timers.filter((t) => !t.cancelled);
    expect(live.at(-1)?.ms).toBe(20 * MINUTE);
    s.stop();
    expect(timers.every((t) => t.cancelled)).toBe(true);
  });
});
