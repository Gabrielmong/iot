import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const CAN = `query($i: ID!) { device(id: $i) { computer { canStats canPower } } }`;
const LIST = `query($i: ID!) { computerGrants(deviceId: $i) { userId stats power } }`;
const SET = `mutation($i: ID!, $g: [ComputerGrantInput!]!) { setComputerGrants(deviceId: $i, grants: $g) { userId stats power } }`;
const SET_USERS = `mutation($i: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $i, userIds: $u) }`;

async function setup() {
  h = await ApiHarness.start();
  const admin = await h.user("Root", "ADMIN");
  const bob = await h.user("Bob");
  const ann = await h.user("Ann");
  const pc = await h.device({ brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:66", config: { mac: "11:22:33:44:55:66" } });
  await h.ok(admin.token, SET_USERS, { i: pc, u: [bob.id, ann.id] });
  return { admin, bob, ann, pc };
}

describe("PC permissions", () => {
  it("admins can do everything; a granted user nothing until given it", async () => {
    const { admin, bob, pc } = await setup();
    expect((await h.ok(admin.token, CAN, { i: pc })).device.computer).toEqual({ canStats: true, canPower: true });
    expect((await h.ok(bob.token, CAN, { i: pc })).device.computer).toEqual({ canStats: false, canPower: false });
    await h.ok(admin.token, SET, { i: pc, g: [{ userId: bob.id, stats: true, power: false }] });
    expect((await h.ok(bob.token, CAN, { i: pc })).device.computer).toEqual({ canStats: true, canPower: false });
  });

  it("lists every granted user with their flags", async () => {
    const { admin, bob, ann, pc } = await setup();
    await h.ok(admin.token, SET, { i: pc, g: [{ userId: ann.id, stats: true, power: true }] });
    const list = (await h.ok(admin.token, LIST, { i: pc })).computerGrants;
    expect(list).toHaveLength(2);
    expect(list).toContainEqual({ userId: bob.id, stats: false, power: false });
    expect(list).toContainEqual({ userId: ann.id, stats: true, power: true });
  });

  it("re-saving who may use the PC keeps the flags; dropping a user drops theirs", async () => {
    const { admin, bob, ann, pc } = await setup();
    await h.ok(admin.token, SET, { i: pc, g: [{ userId: bob.id, stats: true, power: true }, { userId: ann.id, stats: true, power: false }] });
    await h.ok(admin.token, SET_USERS, { i: pc, u: [bob.id] });
    await h.ok(admin.token, SET_USERS, { i: pc, u: [bob.id, ann.id] });
    const list = (await h.ok(admin.token, LIST, { i: pc })).computerGrants;
    expect(list).toContainEqual({ userId: bob.id, stats: true, power: true });
    expect(list).toContainEqual({ userId: ann.id, stats: false, power: false });
  });

  it("saving a user's device list keeps their PC flags", async () => {
    const { admin, bob, pc } = await setup();
    await h.ok(admin.token, SET, { i: pc, g: [{ userId: bob.id, stats: true, power: true }] });
    const lamp = await h.device();
    await h.ok(admin.token, `mutation($u: ID!, $d: [ID!]!) { setGrants(userId: $u, deviceIds: $d) }`, { u: bob.id, d: [pc, lamp] });
    expect((await h.ok(bob.token, CAN, { i: pc })).device.computer).toEqual({ canStats: true, canPower: true });
  });

  it("refuses flags for a user without access, flags on a non-PC, and non-admins", async () => {
    const { admin, bob, pc } = await setup();
    const eve = await h.user("Eve");
    const ungranted = await h.gql(admin.token, SET, { i: pc, g: [{ userId: eve.id, stats: true, power: false }] });
    expect(codes(ungranted)).toEqual(["BAD_USER_INPUT"]);
    expect(ungranted.errors![0].message).toBe("Give Eve access to this PC first");
    const plug = await h.device();
    expect(codes(await h.gql(admin.token, SET, { i: plug, g: [] }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(bob.token, SET, { i: pc, g: [] }))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(bob.token, LIST, { i: pc }))).toEqual(["FORBIDDEN"]);
  });

  it("announces flag changes", async () => {
    const { admin, bob, pc } = await setup();
    const seen: string[] = [];
    h.grantEvents.on("grantsChanged", (id) => seen.push(id));
    await h.ok(admin.token, SET, { i: pc, g: [{ userId: bob.id, stats: true, power: false }] });
    expect(seen).toEqual([pc]);
    await h.ok(admin.token, SET, { i: pc, g: [{ userId: bob.id, stats: true, power: false }] });
    expect(seen).toEqual([pc]); // unchanged: no event
  });
});
