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

describe("guests and computers", () => {
  it("guests can't be granted computers through either grant path", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const g = await guest(h);
    const lamp = await h.device();
    const pc = await h.device({ kind: "COMPUTER" });
    const a = await h.gql(admin.token, `mutation($u: ID!, $d: [ID!]!) { setGrants(userId: $u, deviceIds: $d) }`, { u: g.id, d: [lamp, pc] });
    expect(codes(a)).toEqual(["BAD_USER_INPUT"]);
    expect(a.errors![0].message).toBe("Guests can't have computers");
    const b = await h.gql(admin.token, `mutation($c: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $c, userIds: $u) }`, { c: pc, u: [g.id, bob.id] });
    expect(codes(b)).toEqual(["BAD_USER_INPUT"]);
    expect(b.errors![0].message).toBe("Guests can't have computers");
  });

  it("guests never see a computer, even with a grant row", async () => {
    h = await ApiHarness.start();
    const g = await guest(h);
    const tv = await h.device({ kind: "TV" });
    const pc = await h.device({ kind: "COMPUTER" });
    await h.grant(g.id, tv, pc);
    const all = await h.ok(g.token, `{ devices { id } }`);
    expect(all.devices).toEqual([{ id: tv }]);
    const wake = await h.gql(g.token, `mutation($i: ID!) { setDeviceState(id: $i, patch: { on: true }) { id } }`, { i: pc });
    expect(wake.errors).toBeDefined();
    expect(h.drivers.KASA.commands).toEqual([]);
  });

  it("TVs and computers take commands", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await h.device({ kind: "TV" });
    const r = await h.gql(admin.token, `mutation($i: ID!) { setDeviceState(id: $i, patch: { on: true }) { id } }`, { i: tv });
    expect(r.errors).toBeUndefined();
    expect(h.drivers.KASA.commands).toEqual([{ deviceId: tv, patch: { on: true } }]);
  });
});

describe("becoming a guest", () => {
  it("drops the user's computer grants", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const tv = await h.device({ kind: "TV" });
    const pc = await h.device({ kind: "COMPUTER" });
    await h.grant(bob.id, tv, pc);
    await h.ok(admin.token, `mutation($i: ID!) { updateUser(id: $i, role: GUEST) { role } }`, { i: bob.id });
    const left = await h.db.deviceGrant.findMany({ where: { userId: bob.id } });
    expect(left.map((g) => g.deviceId)).toEqual([tv]);
  });
});
