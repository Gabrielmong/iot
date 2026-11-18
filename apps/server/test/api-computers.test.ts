import { DEVICE_STATE } from "../src/devices/topics.js";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
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

  it("a computer's on/off changes are recorded, a plug's are not", async () => {
    h = await ApiHarness.start();
    const pc = await h.device({ brand: "WOL", kind: "COMPUTER", externalId: "aa:bb:cc:dd:ee:01", config: { mac: "aa:bb:cc:dd:ee:01" } });
    const plug = await h.device();
    h.drivers.WOL.pushState(pc, { online: true, on: true });
    h.drivers.WOL.pushState(pc, { online: true, on: true });
    h.drivers.WOL.pushState(pc, { online: true, on: false });
    h.drivers.KASA.pushState(plug, { online: true, on: true });
    await h.manager.idle();
    const events = await h.manager.history.since(pc, new Date(0));
    expect(events.map((e) => e.on)).toEqual([true, false]);
    expect(await h.db.powerEvent.count({ where: { deviceId: plug } })).toBe(0);
  });

  const pcData = (over: Record<string, unknown> = {}) => ({ brand: "WOL" as const, kind: "COMPUTER" as const, externalId: "aa:bb:cc:dd:ee:02", ip: "192.168.0.50", config: { mac: "aa:bb:cc:dd:ee:02", probeSeen: true }, ...over });

  it("wake progress reaches subscribers", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const pc = await h.device(pcData());
    const sub = await h.subscribe(h.wsClient(admin.token), `subscription { deviceState { id computer { wake { status } } } }`);
    await h.ok(admin.token, WAKE, { i: pc, on: true });
    await sub.waitFor((e) => e.data.deviceState.computer?.wake?.status === "WAKING");
    h.drivers.WOL.pushState(pc, { online: true, on: true });
    await sub.waitFor((e) => e.data.deviceState.computer?.wake?.status === "WOKE");
  });

  it("a granted user gets rdpAddress though ip is null", async () => {
    h = await ApiHarness.start();
    const bob = await h.user("Bob");
    const pc = await h.device(pcData({ config: { mac: "aa:bb:cc:dd:ee:02", probeSeen: true, rdpSeen: true } }));
    await h.grant(bob.id, pc);
    const r = await h.ok(bob.token, `query($i: ID!) { device(id: $i) { ip computer { confirmable rdpAddress wake { status } } } }`, { i: pc });
    expect(r.device).toEqual({ ip: null, computer: { confirmable: true, rdpAddress: "192.168.0.50", wake: null } });
  });

  it("a plug has no computer info", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const plug = await h.device();
    const r = await h.ok(admin.token, `query($i: ID!) { device(id: $i) { computer { confirmable } } }`, { i: plug });
    expect(r.device.computer).toBeNull();
  });

  const HISTORY = `query($i: ID!, $s: String!) { device(id: $i) { powerHistory(since: $s) { on at } } }`;

  it("powerHistory lists a confirmable PC's changes and is empty for an unconfirmable one", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const seen = await h.device(pcData());
    const unseen = await h.device(pcData({ externalId: "aa:bb:cc:dd:ee:03", config: { mac: "aa:bb:cc:dd:ee:03" } }));
    const at = new Date("2026-11-17T08:00:00Z");
    await h.db.powerEvent.createMany({ data: [{ deviceId: seen, on: true, at }, { deviceId: unseen, on: true, at }] });
    const a = await h.ok(admin.token, HISTORY, { i: seen, s: "2026-11-17T00:00:00Z" });
    expect(a.device.powerHistory).toEqual([{ on: true, at: at.toISOString() }]);
    const b = await h.ok(admin.token, HISTORY, { i: unseen, s: "2026-11-17T00:00:00Z" });
    expect(b.device.powerHistory).toEqual([]);
  });

  it("powerHistory rejects a bad since", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const pc = await h.device(pcData());
    expect(codes(await h.gql(admin.token, HISTORY, { i: pc, s: "yesterday" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("a PC's On/Off change is in its history by the time subscribers hear of it", async () => {
    h = await ApiHarness.start();
    const pc = await h.device(pcData());
    const seen: number[] = [];
    await h.pubsub.subscribe(DEVICE_STATE, (p: { deviceId: string; state: { on?: boolean } }) => {
      if (p.deviceId === pc && p.state.on === true) void h.manager.history.since(pc, new Date(0)).then((e) => seen.push(e.length));
    });
    h.drivers.WOL.pushState(pc, { online: true, on: true });
    await h.manager.idle();
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]).toBe(1);
  });

  it("editing a PC keeps what the probe learned about it", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const pc = await h.device(pcData({ config: { mac: "aa:bb:cc:dd:ee:02", probeSeen: true, rdpSeen: true } }));
    await h.ok(admin.token, UPDATE, { i: pc, m: "aa:bb:cc:dd:ee:02", ip: "192.168.0.50" });
    const row = await h.db.device.findUniqueOrThrow({ where: { id: pc } });
    expect(row.config).toEqual({ mac: "aa:bb:cc:dd:ee:02", probeSeen: true, rdpSeen: true });
  });

  it("a PC moved to another IP has to be seen again", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const pc = await h.device(pcData({ config: { mac: "aa:bb:cc:dd:ee:02", probeSeen: true, rdpSeen: true } }));
    await h.ok(admin.token, UPDATE, { i: pc, m: "aa:bb:cc:dd:ee:02", ip: "192.168.0.51" });
    const row = await h.db.device.findUniqueOrThrow({ where: { id: pc } });
    expect(row.config).toEqual({ mac: "aa:bb:cc:dd:ee:02" });
  });
});
