import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { SAMPLE_WEATHER } from "./fixtures/weather.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const WEATHER = `{ weather { status stale updatedAt current { tempC condition } hourly { tempC } daily { maxC } sun { sunrise sunset } } }`;
const PIN = `mutation { updateWeatherSettings(input: { lat: 9.93, lng: -84.08, refreshMinutes: 15, staleMinutes: 45, enabled: true }) { lat } }`;
const CREDS = `mutation { setXweatherCredentials(clientId: "id", clientSecret: "secret") { xweatherConfigured } }`;

describe("weather", () => {
  it("is readable by guests, with sun times once a pin exists", async () => {
    h = await ApiHarness.start({ weatherFetch: async () => SAMPLE_WEATHER });
    const admin = (await h.user("Root", "ADMIN")).token;
    const guest = (await h.user("Visit", "GUEST")).token;
    expect((await h.ok(guest, WEATHER)).weather).toMatchObject({ status: "NOT_CONFIGURED", current: null, sun: null });
    await h.ok(admin, CREDS);
    await h.ok(admin, PIN);
    const w = (await h.ok(guest, WEATHER)).weather;
    expect(w).toMatchObject({ status: "OK", stale: false, current: { tempC: 24, condition: "CLEAR" } });
    expect(w.sun.sunrise).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("never exposes the coordinates", async () => {
    h = await ApiHarness.start();
    const admin = (await h.user("Root", "ADMIN")).token;
    const fields = (await h.ok(admin, `{ __type(name: "Weather") { fields { name } } }`)).__type.fields.map((f: { name: string }) => f.name);
    expect(fields).not.toContain("lat");
    expect(fields).not.toContain("lng");
  });

  it("publishes weatherUpdated when the settings change", async () => {
    h = await ApiHarness.start({ weatherFetch: async () => SAMPLE_WEATHER });
    const admin = (await h.user("Root", "ADMIN")).token;
    const sub = await h.subscribe(h.wsClient(admin), "subscription { weatherUpdated { status } }");
    await h.ok(admin, CREDS);
    await h.ok(admin, PIN);
    await sub.waitFor((e) => e.data?.weatherUpdated?.status === "OK");
  });

  it("reports the last fetch error in the admin settings", async () => {
    h = await ApiHarness.start();
    const admin = (await h.user("Root", "ADMIN")).token;
    await h.ok(admin, CREDS);
    await h.ok(admin, PIN);
    expect((await h.ok(admin, `{ weatherSettings { lastError } }`)).weatherSettings.lastError).toBe("no xweather in tests");
  });
});
