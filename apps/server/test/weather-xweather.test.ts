import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WeatherFetchError } from "../src/weather/types.js";
import { conditionFromCode } from "../src/weather/xweather-codes.js";
import { fetchXweather } from "../src/weather/xweather-client.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const CREDS = { clientId: "the-id", clientSecret: "the-secret" };
const AT = { lat: 9.93, lng: -84.08 };

function fakeFetch(body: string, status = 200) {
  const urls: string[] = [];
  const impl = (async (url: string | URL) => {
    urls.push(String(url));
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, urls };
}

describe("conditionFromCode", () => {
  it.each([
    ["::CL", "CLEAR"],
    ["::FW", "PARTLY_CLOUDY"],
    ["::SC", "PARTLY_CLOUDY"],
    ["::BK", "CLOUDY"],
    ["::OV", "CLOUDY"],
    [":L:RW", "RAIN"],
    [":VL:RW", "RAIN"],
    ["::R", "RAIN"],
    ["::L", "DRIZZLE"],
    ["::T", "STORM"],
    ["::S", "SNOW"],
    ["::F", "FOG"],
    ["::BR", "FOG"],
    ["::H", "FOG"],
    ["::WG", "WINDY"],
    ["xx", "UNKNOWN"],
    [null, "UNKNOWN"],
  ])("%s → %s", (code, expected) => {
    expect(conditionFromCode(code)).toBe(expected);
  });
});

describe("fetchXweather", () => {
  it("makes one batch request with the credentials and maps the response", async () => {
    const { impl, urls } = fakeFetch(fixture("xweather-batch.json"));
    const data = await fetchXweather(CREDS, AT, impl);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("client_id=the-id");
    expect(urls[0]).toContain("client_secret=the-secret");
    expect(urls[0]).toContain("9.93,-84.08");
    expect(data.hourly).toHaveLength(12);
    expect(data.daily).toHaveLength(5);
    expect(typeof data.current.tempC).toBe("number");
    expect(data.current.raining).toBe(["RAIN", "DRIZZLE", "STORM"].includes(data.current.condition));
    expect(data.hourly[0].time).toBeInstanceOf(Date);
    expect(data.daily[0]).toEqual({ date: "2026-11-18", minC: 22, maxC: 29.1, condition: "RAIN", rainChance: 100 });
  });

  it("reports rejected credentials as an auth failure", async () => {
    const { impl } = fakeFetch(fixture("xweather-error.json"), 401);
    const err = await fetchXweather(CREDS, AT, impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherFetchError);
    expect((err as WeatherFetchError).auth).toBe(true);
    expect((err as Error).message).not.toContain("the-secret");
  });

  it("reports a server error as a non-auth failure", async () => {
    const { impl } = fakeFetch("oops", 500);
    const err = await fetchXweather(CREDS, AT, impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherFetchError);
    expect((err as WeatherFetchError).auth).toBe(false);
  });

  it("reports a network failure without the credentials", async () => {
    const impl = (async (url: string) => {
      throw new Error(`connect failed ${url}`);
    }) as unknown as typeof fetch;
    const err = await fetchXweather(CREDS, AT, impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherFetchError);
    expect((err as Error).message).not.toContain("the-secret");
  });
});
