import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "../src/agent/protocol.js";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const POWER = `mutation($i: ID!, $a: PcPowerAction!) { pcPower(deviceId: $i, action: $a) { id deviceId action phase requestedBy } }`;
const CANCEL = `mutation($i: ID!, $id: ID!) { pcPowerCancel(deviceId: $i, id: $id) }`;
const SUB = (id: string) => `subscription { pcPowerState(deviceId: "${id}") { id action phase secondsLeft requestedBy } }`;
const SET_USERS = `mutation($i: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $i, userIds: $u) }`;
const SET_FLAGS = `mutation($i: ID!, $g: [ComputerGrantInput!]!) { setComputerGrants(deviceId: $i, grants: $g) { userId } }`;

/** A PC whose agent is "connected" through a fake connection that records what the server sends. */
async function setup() {
  h = await ApiHarness.start();
  const admin = await h.user("Root", "ADMIN");
  const bob = await h.user("Bob");
  const pc = await h.device({ brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:66", config: { mac: "11:22:33:44:55:66" }, agentTokenHash: "hash-1" });
  await h.ok(admin.token, SET_USERS, { i: pc, u: [bob.id] });
  const sent: ServerMessage[] = [];
  h.agents.attach(pc, { send: (d) => sent.push(JSON.parse(d)), close: () => {} });
  const flags = (power: boolean) => h.ok(admin.token, SET_FLAGS, { i: pc, g: [{ userId: bob.id, stats: false, power }] });
  return { admin, bob, pc, sent, flags };
}

describe("PC power", () => {
  it("someone with Power restarts the PC: the agent gets the request with their name", async () => {
    const { bob, pc, sent, flags } = await setup();
    await flags(true);
    const r = (await h.ok(bob.token, POWER, { i: pc, a: "RESTART" })).pcPower;
    expect(r).toMatchObject({ deviceId: pc, action: "RESTART", phase: "SENT", requestedBy: "Bob" });
    expect(sent).toContainEqual({ v: 1, t: "power", id: r.id, action: "restart", requestedBy: "Bob", seconds: 60 });
  });

  it("subscribers follow the countdown and a cancel at the PC", async () => {
    const { admin, pc } = await setup();
    const sub = await h.subscribe(h.wsClient(admin.token), SUB(pc));
    const { id } = (await h.ok(admin.token, POWER, { i: pc, a: "SLEEP" })).pcPower;
    h.agents.received(pc, { t: "power.state", id, phase: "countdown", secondsLeft: 60 });
    h.agents.received(pc, { t: "power.state", id, phase: "cancelled" });
    await sub.waitFor((e) => e.data?.pcPowerState.phase === "CANCELLED");
    expect(sub.events.map((e) => e.data.pcPowerState)).toEqual([
      { id, action: "SLEEP", phase: "COUNTDOWN", secondsLeft: 60, requestedBy: "Root" },
      { id, action: "SLEEP", phase: "CANCELLED", secondsLeft: null, requestedBy: "Root" },
    ]);
  });

  it("cancelling from the app tells the agent", async () => {
    const { admin, pc, sent } = await setup();
    const { id } = (await h.ok(admin.token, POWER, { i: pc, a: "SHUTDOWN" })).pcPower;
    expect((await h.ok(admin.token, CANCEL, { i: pc, id })).pcPowerCancel).toBe(true);
    expect(sent).toContainEqual({ v: 1, t: "power.cancel", id });
  });

  it("refuses when the agent isn't connected, and without the Power permission", async () => {
    const { admin, bob, pc, flags } = await setup();
    expect(codes(await h.gql(bob.token, POWER, { i: pc, a: "SLEEP" }))).toEqual(["FORBIDDEN"]);
    await flags(true);
    h.agents.closeAll();
    const r = await h.gql(admin.token, POWER, { i: pc, a: "SLEEP" });
    expect(codes(r)).toEqual(["DEVICE_UNREACHABLE"]);
    expect(r.errors![0].message).toBe("The PC's agent isn't connected");
  });

  it("only people who may see the PC hear its power state, checked on every event", async () => {
    const { admin, bob, pc } = await setup();
    const eve = await h.user("Eve");
    const sub = await h.subscribe(h.wsClient(bob.token), SUB(pc));
    const eveSub = await h.subscribe(h.wsClient(eve.token), SUB(pc));
    const { id } = (await h.ok(admin.token, POWER, { i: pc, a: "RESTART" })).pcPower;
    h.agents.received(pc, { t: "power.state", id, phase: "executing" });
    await sub.waitFor((e) => e.data?.pcPowerState.phase === "EXECUTING");
    await h.ok(admin.token, SET_USERS, { i: pc, u: [] });
    h.agents.received(pc, { t: "power.state", id, phase: "skipped" });
    h.agents.received(pc, { t: "power.state", id: "never-sent", phase: "executing" }); // unknown ids are dropped
    await new Promise((r) => setTimeout(r, 100));
    expect(sub.events).toHaveLength(1);
    expect(eveSub.events).toHaveLength(0);
    await vi.waitFor(() => expect(sub.events).toHaveLength(1));
  });
});
