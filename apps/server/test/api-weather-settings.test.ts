import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const READ = `{ weatherSettings { lat lng address refreshMinutes staleMinutes enabled } }`;
const SAVE = `mutation($i: WeatherSettingsInput!) { updateWeatherSettings(input: $i) { lat lng address refreshMinutes staleMinutes enabled } }`;
const GOOD = { lat: 9.93, lng: -84.08, address: "Casa", refreshMinutes: 15, staleMinutes: 45, enabled: true };

async function start() {
  h = await ApiHarness.start();
  return {
    admin: (await h.user("Root", "ADMIN")).token,
    user: (await h.user("Ana", "USER")).token,
    guest: (await h.user("Visit", "GUEST")).token,
  };
}

describe("weather settings", () => {
  it("has defaults before anything is saved", async () => {
    const { admin } = await start();
    expect((await h.ok(admin, READ)).weatherSettings).toEqual({ lat: null, lng: null, address: null, refreshMinutes: 15, staleMinutes: 45, enabled: true });
  });

  it("saves and reads back the pin and options", async () => {
    const { admin } = await start();
    expect((await h.ok(admin, SAVE, { i: GOOD })).updateWeatherSettings).toEqual(GOOD);
    expect((await h.ok(admin, READ)).weatherSettings).toEqual(GOOD);
  });

  it.each([
    ["latitude out of range", { lat: 91 }],
    ["longitude out of range", { lng: -181 }],
    ["only one coordinate", { lng: null }],
    ["refresh too short", { refreshMinutes: 4 }],
    ["refresh too long", { refreshMinutes: 121 }],
    ["stale before refresh", { refreshMinutes: 30, staleMinutes: 20 }],
    ["stale too long", { staleMinutes: 721 }],
  ])("rejects %s", async (_name, change) => {
    const { admin } = await start();
    expect(codes(await h.gql(admin, SAVE, { i: { ...GOOD, ...change } }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("is admin only", async () => {
    const { user, guest } = await start();
    for (const token of [user, guest]) {
      expect(codes(await h.gql(token, READ))).toEqual(["FORBIDDEN"]);
      expect(codes(await h.gql(token, SAVE, { i: GOOD }))).toEqual(["FORBIDDEN"]);
    }
  });
});
