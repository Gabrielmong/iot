import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const SET = `mutation($d: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $d, userIds: $u) }`;
const GET = `query($d: ID!) { deviceGrants(deviceId: $d) }`;
const DEVICES = `{ devices { id } }`;

describe("per-device grants", () => {
  it("forbids a USER from both operations", async () => {
    h = await ApiHarness.start();
    const u = await h.user("Ann");
    const d = await h.device();
    expect(codes(await h.gql(u.token, SET, { d, u: [] }))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(u.token, GET, { d }))).toEqual(["FORBIDDEN"]);
  });

  it("grants then revokes access, emitting grantsChanged each time", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const u1 = await h.user("Ann");
    const d = await h.device();
    const seen: string[] = [];
    h.grantEvents.on("grantsChanged", (id) => seen.push(id));

    expect((await h.ok(root.token, SET, { d, u: [u1.id] })).setDeviceGrants).toEqual([u1.id]);
    expect((await h.ok(root.token, GET, { d })).deviceGrants).toEqual([u1.id]);
    expect((await h.ok(u1.token, DEVICES)).devices.map((x: { id: string }) => x.id)).toEqual([d]);

    expect((await h.ok(root.token, SET, { d, u: [] })).setDeviceGrants).toEqual([]);
    expect((await h.ok(u1.token, DEVICES)).devices).toEqual([]);
    expect(seen).toEqual([d, d]);
  });

  it("ignores ADMIN ids and rejects unknown users and devices", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const u1 = await h.user("Ann");
    const d = await h.device();
    expect((await h.ok(root.token, SET, { d, u: [root.id, u1.id] })).setDeviceGrants).toEqual([u1.id]);
    expect(codes(await h.gql(root.token, SET, { d, u: ["nope"] }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(root.token, SET, { d: "nope", u: [] }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(root.token, GET, { d: "nope" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("also emits grantsChanged from the per-user setGrants for devices that changed", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const u1 = await h.user("Ann");
    const [d1, d2] = [await h.device(), await h.device()];
    const set = `mutation($u: ID!, $d: [ID!]!) { setGrants(userId: $u, deviceIds: $d) }`;
    await h.ok(root.token, set, { u: u1.id, d: [d1] });
    const seen: string[] = [];
    h.grantEvents.on("grantsChanged", (id) => seen.push(id));
    await h.ok(root.token, set, { u: u1.id, d: [d2] });
    expect(seen.sort()).toEqual([d1, d2].sort());
  });
});
