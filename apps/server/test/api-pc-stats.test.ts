import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Stats } from "../src/agent/protocol.js";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const SUB = (id: string) => `subscription { pcStats(deviceId: "${id}") { cpu ramUsed ramTotal gpu { name load tempC } disks { mount free total } netUp netDown uptimeS user idleS } }`;
const SET_USERS = `mutation($i: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $i, userIds: $u) }`;
const SET_FLAGS = `mutation($i: ID!, $g: [ComputerGrantInput!]!) { setComputerGrants(deviceId: $i, grants: $g) { userId } }`;

const SAMPLE: Stats = {
  t: "stats",
  cpu: 12.5,
  ramUsed: 8e9,
  ramTotal: 32e9,
  gpu: { name: "RTX 3070", load: 37, tempC: 54 },
  disks: [{ mount: "C:", free: 120e9, total: 476e9 }],
  netUp: 1200,
  netDown: 3400,
  uptimeS: 3600,
  user: "Gabriel",
  idleS: 720,
};

async function setup() {
  h = await ApiHarness.start();
  const admin = await h.user("Root", "ADMIN");
  const bob = await h.user("Bob");
  const pc = await h.device({ brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:66", config: { mac: "11:22:33:44:55:66" }, agentTokenHash: "hash-1" });
  await h.ok(admin.token, SET_USERS, { i: pc, u: [bob.id] });
  const sent: { t: string }[] = [];
  h.agents.attach(pc, { send: (d) => sent.push(JSON.parse(d)), close: () => {} });
  const flags = (stats: boolean) => h.ok(admin.token, SET_FLAGS, { i: pc, g: [{ userId: bob.id, stats, power: false }] });
  return { admin, bob, pc, sent, flags };
}

describe("PC live stats", () => {
  it("needs the Live stats permission", async () => {
    const { bob, pc } = await setup();
    const ws = h.wsClient(bob.token);
    const errors: unknown[] = []; // a refused subscribe arrives as a result with errors
    ws.client.subscribe({ query: SUB(pc) }, { next: (v) => errors.push(v), error: (e) => errors.push(e), complete: () => {} });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(JSON.stringify(errors[0])).toContain("FORBIDDEN");
  });

  it("asks the agent for stats while watched and relays them", async () => {
    const { bob, pc, sent, flags } = await setup();
    await flags(true);
    const sub = await h.subscribe(h.wsClient(bob.token), SUB(pc));
    expect(sent.map((m) => m.t)).toEqual(["stats.start"]);
    h.agents.received(pc, SAMPLE);
    const e = await sub.waitFor((x) => x.data?.pcStats);
    const { t: _t, ...fields } = SAMPLE;
    expect(e.data.pcStats).toEqual(fields);
  });

  it("losing Live stats ends the subscription", async () => {
    const { bob, pc, flags } = await setup();
    await flags(true);
    const sub = await h.subscribe(h.wsClient(bob.token), SUB(pc));
    await flags(false);
    await vi.waitFor(() => expect(sub.done).toBe(true));
    h.agents.received(pc, SAMPLE);
    await new Promise((r) => setTimeout(r, 50));
    expect(sub.events).toHaveLength(0);
  });

  it("re-checks the permission before each sample", async () => {
    const { bob, pc, flags } = await setup();
    await flags(true);
    const sub = await h.subscribe(h.wsClient(bob.token), SUB(pc));
    await h.db.deviceGrant.update({ where: { userId_deviceId: { userId: bob.id, deviceId: pc } }, data: { stats: false } }); // no grantsChanged
    h.agents.received(pc, SAMPLE);
    await vi.waitFor(() => expect(sub.done).toBe(true));
    expect(sub.events).toHaveLength(0);
  });
});
