import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const CREATE = `mutation($input: RoutineInput!) { createRoutine(input: $input) { id steps { actions { deviceId pcPower } } } }`;
const RUN = `mutation($id: ID!) { runRoutine(id: $id) }`;
const LAST = `query($id: ID!) { routine(id: $id) { lastRun { status problems { deviceName reason } } } }`;
const SET_USERS = `mutation($i: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $i, userIds: $u) }`;
const SET_FLAGS = `mutation($i: ID!, $g: [ComputerGrantInput!]!) { setComputerGrants(deviceId: $i, grants: $g) { userId } }`;

const sleepStep = (deviceId: string, pcPower = "SLEEP") => ({ kind: "SET", actions: [{ deviceId, pcPower }] });
const input = (steps: unknown[], over: Record<string, unknown> = {}) => ({ name: "Night", scope: "PERSONAL", steps, schedules: [], ...over });

async function setup(withAgent = true) {
  h = await ApiHarness.start();
  const root = await h.user("Root", "ADMIN");
  const pc = await h.device({ name: "Gandalf", brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:66", config: { mac: "11:22:33:44:55:66" }, agentTokenHash: withAgent ? "hash-1" : null });
  const sent: any[] = [];
  return { root, pc, sent, attach: () => h.agents.attach(pc, { send: (d) => sent.push(JSON.parse(d)), close: () => {} }) };
}

async function lastRun(token: string, id: string, status: string) {
  let run: any;
  await vi.waitFor(async () => {
    run = (await h.ok(token, LAST, { id })).routine.lastRun;
    expect(run?.status).toBe(status);
  });
  return run;
}

describe("routines that sleep or shut down PCs", () => {
  it("refuses sleep on a PC without an agent", async () => {
    const { root, pc } = await setup(false);
    const res = await h.gql(root.token, CREATE, { input: input([sleepStep(pc)]) });
    expect(codes(res)).toEqual(["BAD_USER_INPUT"]);
    expect(res.errors[0].message).toBe("Gandalf has no agent");
  });

  it("refuses restart in a routine", async () => {
    const { root, pc } = await setup();
    const res = await h.gql(root.token, CREATE, { input: input([sleepStep(pc, "RESTART")]) });
    expect(codes(res)).toEqual(["BAD_USER_INPUT"]);
  });

  it("a personal routine needs the owner's power permission", async () => {
    const { root, pc } = await setup();
    const bob = await h.user("Bob");
    await h.ok(root.token, SET_USERS, { i: pc, u: [bob.id] });
    expect(codes(await h.gql(bob.token, CREATE, { input: input([sleepStep(pc)]) }))).toEqual(["FORBIDDEN"]);
    await h.ok(root.token, SET_FLAGS, { i: pc, g: [{ userId: bob.id, stats: false, power: true }] });
    const saved = (await h.ok(bob.token, CREATE, { input: input([sleepStep(pc)]) })).createRoutine;
    expect(saved.steps[0].actions).toEqual([{ deviceId: pc, pcPower: "SLEEP" }]);
  });

  it("a run asks the agent to sleep, naming the routine", async () => {
    const { root, pc, sent, attach } = await setup();
    attach();
    const id = (await h.ok(root.token, CREATE, { input: input([sleepStep(pc)]) })).createRoutine.id;
    await h.ok(root.token, RUN, { id });
    await lastRun(root.token, id, "OK");
    expect(sent).toMatchObject([{ t: "power", action: "sleep", requestedBy: "Routine Night" }]);
  });

  it("an offline agent makes the run partial", async () => {
    const { root, pc } = await setup();
    const lamp = await h.device();
    const id = (await h.ok(root.token, CREATE, { input: input([{ kind: "SET", actions: [{ deviceId: lamp, on: true }, { deviceId: pc, pcPower: "SHUTDOWN" }] }]) })).createRoutine.id;
    await h.ok(root.token, RUN, { id });
    const run = await lastRun(root.token, id, "PARTIAL");
    expect(run.problems).toEqual([{ deviceName: "Gandalf", reason: "UNREACHABLE" }]);
  });

  it("a personal routine whose owner lost power records NO_ACCESS", async () => {
    const { root, pc, sent, attach } = await setup();
    attach();
    const bob = await h.user("Bob");
    await h.ok(root.token, SET_USERS, { i: pc, u: [bob.id] });
    await h.ok(root.token, SET_FLAGS, { i: pc, g: [{ userId: bob.id, stats: false, power: true }] });
    const id = (await h.ok(bob.token, CREATE, { input: input([sleepStep(pc)]) })).createRoutine.id;
    await h.ok(root.token, SET_FLAGS, { i: pc, g: [{ userId: bob.id, stats: false, power: false }] });
    await h.ok(bob.token, RUN, { id });
    await lastRun(root.token, id, "FAILED");
    expect((await h.ok(root.token, LAST, { id })).routine.lastRun.problems).toEqual([{ deviceName: "Gandalf", reason: "NO_ACCESS" }]);
    expect(sent).toEqual([]);
  });
});
