import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

async function guest(h: ApiHarness): Promise<{ id: string; token: string }> {
  const row = await h.db.user.create({ data: { name: "Guest", role: "GUEST", avatarColor: "#8e24aa", pinHash: null } });
  const r = await h.ok(null, `mutation($u: ID!) { loginGuest(userId: $u, shared: false) { token } }`, { u: row.id });
  return { id: row.id, token: r.loginGuest.token };
}

const ROUTINE = `mutation($i: RoutineInput!) { createRoutine(input: $i) { id } }`;
const personal = (name: string) => ({ name, scope: "PERSONAL", steps: [], schedules: [] });

describe("guest restrictions", () => {
  it("guests can't be granted cameras", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const g = await guest(h);
    const lamp = await h.device();
    const cam = await h.device({ kind: "CAMERA", brand: "KASA" });
    const a = await h.gql(admin.token, `mutation($u: ID!, $d: [ID!]!) { setGrants(userId: $u, deviceIds: $d) }`, { u: g.id, d: [lamp, cam] });
    expect(codes(a)).toEqual(["BAD_USER_INPUT"]);
    expect(a.errors![0].message).toBe("Guests can't have cameras");
    const b = await h.gql(admin.token, `mutation($c: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $c, userIds: $u) }`, { c: cam, u: [g.id, bob.id] });
    expect(codes(b)).toEqual(["BAD_USER_INPUT"]);
    expect(b.errors![0].message).toBe("Guests can't have cameras");
  });

  it("guests never see a camera", async () => {
    h = await ApiHarness.start();
    const g = await guest(h);
    const lamp = await h.device();
    const cam = await h.device({ kind: "CAMERA", brand: "KASA" });
    await h.grant(g.id, lamp, cam);
    const one = await h.ok(g.token, `query($i: ID!) { device(id: $i) { id } }`, { i: cam });
    expect(one.device).toBeNull();
    const all = await h.ok(g.token, `{ devices { id } }`);
    expect(all.devices).toEqual([{ id: lamp }]);
  });

  it("guests can't create, try, or edit routines, but run shared ones", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const g = await guest(h);
    const lamp = await h.device();
    await h.grant(g.id, lamp);
    expect(codes(await h.gql(g.token, ROUTINE, { i: personal("Mine") }))).toEqual(["FORBIDDEN"]);
    const t = await h.gql(g.token, `mutation($i: RoutineInput!) { tryRoutine(input: $i) }`, { i: personal("Try") });
    expect(codes(t)).toEqual(["FORBIDDEN"]);
    const made = await h.ok(admin.token, `mutation($i: RoutineInput!) { createRoutine(input: $i) { id } }`, {
      i: { name: "Shared", scope: "SHARED", steps: [{ kind: "SET", actions: [{ deviceId: lamp, on: true }] }], schedules: [], audience: [g.id] },
    });
    const list = await h.ok(g.token, `{ routines { id editable } }`);
    expect(list.routines).toEqual([{ id: made.createRoutine.id, editable: false }]);
    const run = await h.ok(g.token, `mutation($i: ID!) { runRoutine(id: $i) }`, { i: made.createRoutine.id });
    expect(run.runRoutine).toBe(true);
  });

  it("guests can't create camera groups or be in their audience", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const g = await guest(h);
    const cam = await h.device({ kind: "CAMERA", brand: "KASA" });
    const MAKE = `mutation($i: CameraGroupInput!) { createCameraGroup(input: $i) { id } }`;
    const mine = await h.gql(g.token, MAKE, { i: { name: "Mine", scope: "PERSONAL", layout: 1, cameraIds: [cam] } });
    expect(codes(mine)).toEqual(["FORBIDDEN"]);
    const shared = await h.gql(admin.token, MAKE, { i: { name: "S", scope: "SHARED", layout: 1, cameraIds: [cam], audience: [g.id] } });
    expect(codes(shared)).toEqual(["BAD_USER_INPUT"]);
  });

  it("guests can't edit their profile but can save a dashboard layout", async () => {
    h = await ApiHarness.start();
    const g = await guest(h);
    const lamp = await h.device();
    await h.grant(g.id, lamp);
    const p = await h.gql(g.token, `mutation { updateProfile(name: "X") { id } }`);
    expect(codes(p)).toEqual(["FORBIDDEN"]);
    const s = await h.ok(g.token, `mutation($i: [LayoutItemInput!]!) { saveDashboardLayout(tab: "all", items: $i) { items { deviceId } } }`, {
      i: [{ deviceId: lamp, size: "S1x1" }],
    });
    expect(s.saveDashboardLayout.items).toEqual([{ deviceId: lamp }]);
  });
});
