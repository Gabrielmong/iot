import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const ADD = `mutation($ip: String!) { addTvByIp(ip: $ip) { id kind brand name adopted } }`;

describe("addTvByIp", () => {
  it("records the TV a driver identifies at the address", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    h.drivers.ANDROID_TV.identifyAt["10.0.0.7"] = { brand: "ANDROID_TV", kind: "TV", externalId: "uuid-1", ip: "10.0.0.7", name: "Sala" };
    const tv = (await h.ok(root.token, ADD, { ip: " 10.0.0.7 " })).addTvByIp;
    expect(tv).toMatchObject({ kind: "TV", brand: "ANDROID_TV", name: "Sala", adopted: false });
  });

  it("says no supported TV answered when no driver recognises the address", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const res = await h.gql(root.token, ADD, { ip: "10.0.0.9" });
    expect(codes(res)).toEqual(["DEVICE_UNREACHABLE"]);
    expect(res.errors?.[0]?.message).toBe("No supported TV answered at 10.0.0.9");
  });

  it("a driver that fails to identify counts as no match", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    h.drivers.ANDROID_TV.identify = async () => {
      throw new Error("socket hang up");
    };
    expect(codes(await h.gql(root.token, ADD, { ip: "10.0.0.9" }))).toEqual(["DEVICE_UNREACHABLE"]);
  });

  it("rejects an address that isn't IPv4, and non-admins", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const res = await h.gql(root.token, ADD, { ip: "tv.local" });
    expect(codes(res)).toEqual(["BAD_USER_INPUT"]);
    expect(res.errors?.[0]?.message).toBe("Enter an IPv4 address");
    expect(codes(await h.gql(ann.token, ADD, { ip: "10.0.0.7" }))).toEqual(["FORBIDDEN"]);
  });
});
