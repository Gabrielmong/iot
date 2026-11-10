import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const ADD = `mutation($n: String!, $r: ID, $m: String!, $ip: String) { addComputer(name: $n, roomId: $r, mac: $m, ip: $ip) { id name kind brand ip adopted mac } }`;
const UPDATE = `mutation($i: ID!, $m: String!, $ip: String) { updateComputer(id: $i, mac: $m, ip: $ip) { id ip } }`;
const WAKE = `mutation($i: ID!, $on: Boolean!) { setDeviceState(id: $i, patch: { on: $on }) { id } }`;

describe("computers", () => {
  it("an admin adds a computer by MAC, stored normalised", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const r = await h.ok(admin.token, ADD, { n: "Office PC", m: "AA-BB-CC-DD-EE-FF", ip: "192.168.0.50" });
    expect(r.addComputer).toMatchObject({ name: "Office PC", kind: "COMPUTER", brand: "WOL", ip: "192.168.0.50", adopted: true, mac: "aa:bb:cc:dd:ee:ff" });
    const row = await h.db.device.findUniqueOrThrow({ where: { id: r.addComputer.id } });
    expect(row.externalId).toBe("aa:bb:cc:dd:ee:ff");
    expect(row.config).toEqual({ mac: "aa:bb:cc:dd:ee:ff" });
    expect(h.drivers.WOL.synced.at(-1)?.map((d) => d.id)).toEqual([r.addComputer.id]);
  });

  it("refuses a bad MAC, a duplicate MAC, a bad IP, and non-admins", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const bad = await h.gql(admin.token, ADD, { n: "PC", m: "nope" });
    expect(codes(bad)).toEqual(["BAD_USER_INPUT"]);
    expect(bad.errors![0].message).toBe("Enter a MAC address like AA:BB:CC:DD:EE:FF");
    await h.ok(admin.token, ADD, { n: "PC", m: "aa:bb:cc:dd:ee:ff" });
    const dup = await h.gql(admin.token, ADD, { n: "PC 2", m: "AABBCCDDEEFF" });
    expect(dup.errors![0].message).toBe("That computer is already added");
    const ip = await h.gql(admin.token, ADD, { n: "PC 3", m: "11:22:33:44:55:66", ip: "pc.local" });
    expect(ip.errors![0].message).toBe("Enter an IPv4 address");
    expect(codes(await h.gql(bob.token, ADD, { n: "PC 4", m: "11:22:33:44:55:67" }))).toEqual(["FORBIDDEN"]);
  });

  it("updates a computer's MAC and IP, but not to another computer's MAC", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const a = (await h.ok(admin.token, ADD, { n: "A", m: "aa:bb:cc:dd:ee:01" })).addComputer.id;
    await h.ok(admin.token, ADD, { n: "B", m: "aa:bb:cc:dd:ee:02" });
    const r = await h.ok(admin.token, UPDATE, { i: a, m: "AA:BB:CC:DD:EE:03", ip: "10.0.0.9" });
    expect(r.updateComputer.ip).toBe("10.0.0.9");
    const row = await h.db.device.findUniqueOrThrow({ where: { id: a } });
    expect([row.externalId, row.config]).toEqual(["aa:bb:cc:dd:ee:03", { mac: "aa:bb:cc:dd:ee:03" }]);
    const clash = await h.gql(admin.token, UPDATE, { i: a, m: "aa:bb:cc:dd:ee:02" });
    expect(clash.errors![0].message).toBe("That computer is already added");
    const lamp = await h.device();
    expect(codes(await h.gql(admin.token, UPDATE, { i: lamp, m: "aa:bb:cc:dd:ee:09" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("wakes, never turns off, and only for users with access", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const eve = await h.user("Eve");
    const pc = (await h.ok(admin.token, ADD, { n: "Office PC", m: "aa:bb:cc:dd:ee:ff" })).addComputer.id;
    await h.grant(bob.id, pc);
    const off = await h.gql(admin.token, WAKE, { i: pc, on: false });
    expect(codes(off)).toEqual(["BAD_USER_INPUT"]);
    expect(off.errors![0].message).toBe("Computers can only be woken, not turned off");
    await h.ok(bob.token, WAKE, { i: pc, on: true });
    expect(h.drivers.WOL.commands).toEqual([{ deviceId: pc, patch: { on: true } }]);
    expect(await h.gql(eve.token, WAKE, { i: pc, on: true })).toHaveProperty("errors");
    expect(h.drivers.WOL.commands).toHaveLength(1);
  });
});
