import { afterAll, afterEach, describe, expect, it } from "vitest";
import { decryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { WeatherFetchError, type LatLng, type WeatherFetcher } from "../src/weather/types.js";
import { SAMPLE_WEATHER } from "./fixtures/weather.js";
import { ApiHarness, codes, KEY, type HarnessOptions } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);


async function start(opts?: HarnessOptions) {
  h = await ApiHarness.start(opts);
  const admin = (await h.user("Root", "ADMIN")).token;
  const user = (await h.user("Ana", "USER")).token;
  return { admin, user };
}

const SET_XW = `mutation($id: String!, $s: String!) { setXweatherCredentials(clientId: $id, clientSecret: $s) { xweatherConfigured googleMapsConfigured } }`;
const SET_MAPS = `mutation($k: String!) { setGoogleMapsKey(apiKey: $k) { googleMapsConfigured } }`;
const MAPS_KEY = `{ mapsApiKey }`;
const TEST = `mutation { testXweather }`;

describe("Xweather credentials", () => {
  it("stores them encrypted and reports only that they are configured", async () => {
    const { admin } = await start();
    const r = await h.ok(admin, SET_XW, { id: "client-1", s: "secret-1" });
    expect(r.setXweatherCredentials).toEqual({ xweatherConfigured: true, googleMapsConfigured: false });
    const row = await h.db.setting.findUniqueOrThrow({ where: { key: SettingKey.xweatherClientSecret } });
    expect(row.value).not.toContain("secret-1");
    expect(decryptSecret(row.value, KEY)).toBe("secret-1");
  });

  it("rejects a blank client ID", async () => {
    const { admin } = await start();
    expect(codes(await h.gql(admin, SET_XW, { id: "  ", s: "secret" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("tests the connection at the fallback point when no location is saved", async () => {
    const seen: LatLng[] = [];
    const fetcher: WeatherFetcher = async (_creds, at) => {
      seen.push(at);
      return SAMPLE_WEATHER;
    };
    const { admin } = await start({ weatherFetch: fetcher });
    await h.ok(admin, SET_XW, { id: "client-1", s: "secret-1" });
    expect((await h.ok(admin, TEST)).testXweather).toBe(true);
    expect(seen.at(-1)).toEqual({ lat: 9.93, lng: -84.08 });
  });

  it("tests the connection at the saved home location", async () => {
    const seen: LatLng[] = [];
    const { admin } = await start({ weatherFetch: async (_c, at) => (seen.push(at), SAMPLE_WEATHER) });
    await h.ok(admin, SET_XW, { id: "client-1", s: "secret-1" });
    await h.ok(admin, `mutation { updateWeatherSettings(input: { lat: 10.5, lng: -85.1, refreshMinutes: 15, staleMinutes: 45, enabled: true }) { lat } }`);
    await h.ok(admin, TEST);
    expect(seen.at(-1)).toEqual({ lat: 10.5, lng: -85.1 });
  });

  it("reports rejected credentials as XWEATHER_FAILED", async () => {
    const { admin } = await start({ weatherFetch: async () => Promise.reject(new WeatherFetchError("Xweather rejected the credentials", true)) });
    await h.ok(admin, SET_XW, { id: "client-1", s: "secret-1" });
    const r = await h.gql(admin, TEST);
    expect(codes(r)).toEqual(["XWEATHER_FAILED"]);
    expect(r.errors?.[0].message).toBe("Xweather rejected the credentials");
  });
});

describe("Google Maps key", () => {
  it("is null until saved, then given back to admins", async () => {
    const { admin } = await start();
    expect((await h.ok(admin, MAPS_KEY)).mapsApiKey).toBeNull();
    expect((await h.ok(admin, SET_MAPS, { k: "k-123" })).setGoogleMapsKey).toEqual({ googleMapsConfigured: true });
    expect((await h.ok(admin, MAPS_KEY)).mapsApiKey).toBe("k-123");
  });
});

describe("access", () => {
  it("is admin only", async () => {
    const { user } = await start();
    expect(codes(await h.gql(user, SET_XW, { id: "a", s: "b" }))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(user, SET_MAPS, { k: "k" }))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(user, MAPS_KEY))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(user, TEST))).toEqual(["FORBIDDEN"]);
  });
});
