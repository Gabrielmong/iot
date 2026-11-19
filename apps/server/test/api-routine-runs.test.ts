import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { coded } from "../src/api-errors.js";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";
import { SAMPLE_WEATHER } from "./fixtures/weather.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const RUN_FIELDS = `status startedAt endedAt problems { deviceName reason } hiddenProblems`;
const ONE = `query($id: ID!) { routine(id: $id) { lastRun { ${RUN_FIELDS} } } }`;
const CREATE = `mutation($input: RoutineInput!) { createRoutine(input: $input) { id } }`;
const RUN = `mutation($id: ID!) { runRoutine(id: $id) }`;
const STOP = `mutation($id: ID!) { stopRoutine(id: $id) }`;
const TRY = `mutation($input: RoutineInput!) { tryRoutine(input: $input) }`;
const RUN_EVENTS = `subscription { routineRunChanged { routineId run { ${RUN_FIELDS} } } }`;

const setOn = (...deviceIds: string[]) => ({ kind: "SET", actions: deviceIds.map((deviceId) => ({ deviceId, on: true })) });
const input = (over: Record<string, unknown> = {}) => ({ name: "Movie night", scope: "PERSONAL", steps: [], schedules: [], ...over });

async function lastRun(token: string, id: string, status: string) {
  let run: any;
  await vi.waitFor(async () => {
    run = (await h.ok(token, ONE, { id })).routine.lastRun;
    expect(run?.status).toBe(status);
  });
  return run;
}

describe("routine runs", () => {
  it("running a routine switches its devices and records OK", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const [a, b] = [await h.device(), await h.device()];
    await h.grant(ann.id, a, b);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(a, b)] }) })).createRoutine.id;
    expect((await h.ok(ann.token, RUN, { id })).runRoutine).toBe(true);
    const run = await lastRun(ann.token, id, "OK");
    expect(run).toMatchObject({ problems: [], hiddenProblems: 0 });
    expect(run.endedAt).not.toBeNull();
    expect(h.drivers.KASA.commands.map((c) => c.deviceId).sort()).toEqual([a, b].sort());
  });

  it("running a routine turns on a TV and wakes a computer through their drivers", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const tv = await h.device({ kind: "TV", brand: "ANDROID_TV" });
    const pc = await h.device({ kind: "COMPUTER", brand: "WOL", config: { mac: "aa:bb:cc:dd:ee:ff" } });
    const id = (await h.ok(root.token, CREATE, { input: input({ steps: [setOn(tv, pc)] }) })).createRoutine.id;
    await h.ok(root.token, RUN, { id });
    await lastRun(root.token, id, "OK");
    expect(h.drivers.ANDROID_TV.commands).toMatchObject([{ deviceId: tv, patch: { on: true } }]);
    expect(h.drivers.WOL.commands).toMatchObject([{ deviceId: pc, patch: { on: true } }]);
  });

  it("a user runs a shared routine including devices they lack", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const lamp = await h.device();
    const id = (await h.ok(root.token, CREATE, { input: input({ scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine.id;
    await h.ok(ann.token, RUN, { id });
    await lastRun(ann.token, id, "OK");
    expect(h.drivers.KASA.commands).toEqual([{ deviceId: lamp, patch: { on: true } }]);
  });

  it("a personal routine skips devices whose grant was revoked", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const [a, b] = [await h.device(), await h.device({ name: "Fan" })];
    await h.grant(ann.id, a, b);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(a, b)] }) })).createRoutine.id;
    await h.db.deviceGrant.delete({ where: { userId_deviceId: { userId: ann.id, deviceId: b } } });
    await h.ok(ann.token, RUN, { id });
    const run = await lastRun(ann.token, id, "PARTIAL");
    expect(run).toMatchObject({ problems: [], hiddenProblems: 1 });
    const root = await h.user("Root", "ADMIN");
    expect((await h.ok(root.token, ONE, { id })).routine.lastRun.problems).toEqual([{ deviceName: "Fan", reason: "NO_ACCESS" }]);
  });

  it("routineRunChanged reaches audience members; problem names hidden from users without access", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device({ name: "Lamp" });
    h.drivers.KASA.setStateImpl = async () => Promise.reject(coded("DEVICE_UNREACHABLE", "unreachable"));
    const id = (await h.ok(root.token, CREATE, { input: input({ scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine.id;
    const annSub = await h.subscribe(h.wsClient(ann.token), RUN_EVENTS);
    const bobSub = await h.subscribe(h.wsClient(bob.token), RUN_EVENTS);
    const rootSub = await h.subscribe(h.wsClient(root.token), RUN_EVENTS);
    await h.ok(root.token, RUN, { id });
    const annDone = await annSub.waitFor((e) => e.data?.routineRunChanged.run.status === "FAILED");
    expect(annDone.data.routineRunChanged).toMatchObject({ routineId: id, run: { problems: [], hiddenProblems: 1 } });
    const rootDone = await rootSub.waitFor((e) => e.data?.routineRunChanged.run.status === "FAILED");
    expect(rootDone.data.routineRunChanged.run.problems).toEqual([{ deviceName: "Lamp", reason: "UNREACHABLE" }]);
    expect(bobSub.events).toEqual([]);
  });

  it("stopRoutine during a wait reports STOPPED", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const steps = [setOn(lamp), { kind: "WAIT", waitMinutes: 30 }, setOn(lamp)];
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps }) })).createRoutine.id;
    await h.ok(ann.token, RUN, { id });
    await vi.waitFor(() => expect(h.pendingWaits()).toBe(1));
    expect((await h.ok(ann.token, STOP, { id })).stopRoutine).toBe(true);
    await lastRun(ann.token, id, "STOPPED");
    expect(h.drivers.KASA.commands).toHaveLength(1);
  });

  it("deleting a routine or its owner mid-run stops it without errors", async () => {
    h = await ApiHarness.start();
    const errors: unknown[] = [];
    h.log.error = (...args: unknown[]) => void errors.push(args);
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const steps = [setOn(lamp), { kind: "WAIT", waitMinutes: 30 }, setOn(lamp)];
    const r1 = (await h.ok(ann.token, CREATE, { input: input({ steps }) })).createRoutine.id;
    const r2 = (await h.ok(ann.token, CREATE, { input: input({ name: "Second", steps }) })).createRoutine.id;
    await h.ok(ann.token, RUN, { id: r1 });
    await h.ok(ann.token, RUN, { id: r2 });
    await vi.waitFor(() => expect(h.pendingWaits()).toBe(2));
    await h.ok(ann.token, `mutation($id: ID!) { deleteRoutine(id: $id) }`, { id: r1 });
    await h.ok(root.token, `mutation($id: ID!) { deleteUser(id: $id) }`, { id: ann.id });
    h.releaseWaits();
    await new Promise((r) => setTimeout(r, 50));
    expect(h.drivers.KASA.commands).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it("tryRoutine runs a draft without storing lastRun; an inaccessible device is a problem", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const [mine, theirs] = [await h.device({ name: "Mine" }), await h.device({ name: "Theirs" })];
    await h.grant(ann.id, mine);
    const sub = await h.subscribe(h.wsClient(ann.token), RUN_EVENTS);
    expect((await h.ok(ann.token, TRY, { input: input({ steps: [setOn(mine, theirs)] }) })).tryRoutine).toBe(true);
    const done = await sub.waitFor((e) => e.data?.routineRunChanged.run.status === "PARTIAL");
    expect(done.data.routineRunChanged).toMatchObject({ routineId: "try", run: { hiddenProblems: 1 } });
    expect(h.drivers.KASA.commands).toEqual([{ deviceId: mine, patch: { on: true } }]);
    expect(await h.db.routineRun.count()).toBe(0);
  });

  it("markInterrupted turns RUNNING into INTERRUPTED", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    await h.db.routineRun.create({ data: { routineId: id, status: "RUNNING", startedAt: new Date(h.time), problems: [] } });
    await h.routines.markInterrupted();
    const run = await lastRun(ann.token, id, "INTERRUPTED");
    expect(run.endedAt).not.toBeNull();
  });

  it("a user can't run a routine they can't see", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    expect(codes(await h.gql(bob.token, RUN, { id }))).toEqual(["NOT_FOUND"]);
    expect(codes(await h.gql(bob.token, STOP, { id }))).toEqual(["NOT_FOUND"]);
  });

  it("shows the current step, when the wait ends and who started it", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const steps = [setOn(lamp), { kind: "WAIT", waitMinutes: 30 }, setOn(lamp)];
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps }) })).createRoutine.id;
    await h.ok(ann.token, RUN, { id });
    await vi.waitFor(() => expect(h.pendingWaits()).toBe(1));
    const PROGRESS = `query($id: ID!) { routine(id: $id) { lastRun { status currentStep waitUntil startedBy } } }`;
    let run: any;
    await vi.waitFor(async () => {
      run = (await h.ok(ann.token, PROGRESS, { id })).routine.lastRun;
      expect(run.currentStep).toBe(1);
    });
    expect(run).toEqual({ status: "RUNNING", currentStep: 1, waitUntil: new Date(h.time + 30 * 60_000).toISOString(), startedBy: "Ann" });
    h.releaseWaits();
    await lastRun(ann.token, id, "OK");
    expect((await h.ok(ann.token, PROGRESS, { id })).routine.lastRun).toMatchObject({ currentStep: null, waitUntil: null });
    await h.routines.runScheduled(id);
    await vi.waitFor(async () => expect((await h.ok(ann.token, PROGRESS, { id })).routine.lastRun).toMatchObject({ status: "RUNNING", startedBy: null }));
  });

  it("problems say which step they happened in", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const lamp = await h.device({ name: "Lamp" });
    h.drivers.KASA.setStateImpl = async () => Promise.reject(coded("DEVICE_UNREACHABLE", "unreachable"));
    const id = (await h.ok(root.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    await h.ok(root.token, RUN, { id });
    await lastRun(root.token, id, "FAILED");
    const run = (await h.ok(root.token, `query($id: ID!) { routine(id: $id) { lastRun { problems { step deviceId deviceName reason } } } }`, { id })).routine.lastRun;
    expect(run.problems).toEqual([{ step: 0, deviceId: lamp, deviceName: "Lamp", reason: "UNREACHABLE" }]);
  });
  describe("routines running routines", () => {
    const callB = (routineId: string) => ({ kind: "ROUTINE", routineId });
    const PATH_RUN = `query($id: ID!) { routine(id: $id) { lastRun { status hiddenProblems currentPath { routineName step stepCount } problems { step deviceId deviceName reason routineName } } } }`;

    it("running A which calls B switches B's device and stores a last run on A only", async () => {
      h = await ApiHarness.start();
      const ann = await h.user("Ann");
      const lamp = await h.device();
      await h.grant(ann.id, lamp);
      const b = (await h.ok(ann.token, CREATE, { input: input({ name: "B", steps: [setOn(lamp)] }) })).createRoutine.id;
      const a = (await h.ok(ann.token, CREATE, { input: input({ name: "A", steps: [callB(b)] }) })).createRoutine.id;
      await h.ok(ann.token, RUN, { id: a });
      const run = await lastRun(ann.token, a, "OK");
      expect(run.problems).toEqual([]);
      expect(h.drivers.KASA.commands).toEqual([{ deviceId: lamp, patch: { on: true } }]);
      expect((await h.ok(ann.token, ONE, { id: b })).routine.lastRun).toBeNull();
      expect(await h.db.routineRun.count()).toBe(1);
    });

    it("a shared routine the caller lost access to is a NO_ACCESS problem without a device", async () => {
      h = await ApiHarness.start();
      const root = await h.user("Root", "ADMIN");
      const ann = await h.user("Ann");
      const lamp = await h.device();
      const shared = (await h.ok(root.token, CREATE, { input: input({ name: "Shared", scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine.id;
      const a = (await h.ok(ann.token, CREATE, { input: input({ name: "Mine", steps: [callB(shared)] }) })).createRoutine.id;
      await h.db.routineAudience.deleteMany({ where: { routineId: shared } });
      await h.ok(ann.token, RUN, { id: a });
      await lastRun(ann.token, a, "FAILED");
      const run = (await h.ok(ann.token, PATH_RUN, { id: a })).routine.lastRun;
      expect(run.problems).toEqual([{ step: 0, deviceId: null, deviceName: null, reason: "NO_ACCESS", routineName: null }]);
      expect(run.hiddenProblems).toBe(0);
      expect(h.drivers.KASA.commands).toEqual([]);
    });

    it("problems without a device show to every viewer", async () => {
      h = await ApiHarness.start();
      const root = await h.user("Root", "ADMIN");
      const ann = await h.user("Ann");
      const lamp = await h.device();
      const shared = (await h.ok(root.token, CREATE, { input: input({ name: "Shared", scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine.id;
      const a = (await h.ok(root.token, CREATE, { input: input({ name: "Top", scope: "SHARED", steps: [callB(shared)], audience: [ann.id] }) })).createRoutine.id;
      await h.db.routineAudience.deleteMany({ where: { routineId: shared } });
      await h.db.routine.delete({ where: { id: shared } });
      await h.ok(root.token, RUN, { id: a });
      await lastRun(root.token, a, "FAILED");
      for (const token of [root.token, ann.token]) {
        const run = (await h.ok(token, PATH_RUN, { id: a })).routine.lastRun;
        expect(run.problems).toMatchObject([{ deviceId: null, deviceName: null, reason: "ROUTINE_REMOVED" }]);
        expect(run.hiddenProblems).toBe(0);
      }
    });

    it("the routines query names the called routine, or null once it is deleted", async () => {
      h = await ApiHarness.start();
      const ann = await h.user("Ann");
      const lamp = await h.device();
      await h.grant(ann.id, lamp);
      const b = (await h.ok(ann.token, CREATE, { input: input({ name: "B", steps: [setOn(lamp)] }) })).createRoutine.id;
      await h.ok(ann.token, CREATE, { input: input({ name: "A", steps: [callB(b)] }) });
      const LIST = `query { routines { name steps { kind routineId routineName actions { deviceId } } } }`;
      const step = async () => (await h.ok(ann.token, LIST)).routines.find((r: any) => r.name === "A").steps[0];
      expect(await step()).toEqual({ kind: "ROUTINE", routineId: b, routineName: "B", actions: [] });
      await h.db.routine.delete({ where: { id: b } });
      expect(await step()).toEqual({ kind: "ROUTINE", routineId: b, routineName: null, actions: [] });
    });

    it("a routine the viewer can't see shows as Another routine in steps and in problems", async () => {
      h = await ApiHarness.start();
      const root = await h.user("Root", "ADMIN");
      const ann = await h.user("Ann");
      const lamp = await h.device();
      await h.grant(ann.id, lamp);
      h.drivers.KASA.setStateImpl = async () => Promise.reject(coded("DEVICE_UNREACHABLE", "unreachable"));
      const b = (await h.ok(root.token, CREATE, { input: input({ name: "Secret", scope: "SHARED", steps: [setOn(lamp)], audience: [] }) })).createRoutine.id;
      const a = (await h.ok(root.token, CREATE, { input: input({ name: "Top", scope: "SHARED", steps: [callB(b)], audience: [ann.id] }) })).createRoutine.id;
      await h.ok(root.token, RUN, { id: a });
      await lastRun(root.token, a, "FAILED");
      const Q = `query($id: ID!) { routine(id: $id) { steps { routineName } lastRun { problems { routineName } } } }`;
      expect((await h.ok(ann.token, Q, { id: a })).routine).toEqual({ steps: [{ routineName: "Another routine" }], lastRun: { problems: [{ routineName: "Another routine" }] } });
      expect((await h.ok(root.token, Q, { id: a })).routine).toEqual({ steps: [{ routineName: "Secret" }], lastRun: { problems: [{ routineName: "Secret" }] } });
    });

    it("tryRoutine runs a called routine", async () => {
      h = await ApiHarness.start();
      const ann = await h.user("Ann");
      const lamp = await h.device();
      await h.grant(ann.id, lamp);
      const b = (await h.ok(ann.token, CREATE, { input: input({ name: "B", steps: [setOn(lamp)] }) })).createRoutine.id;
      const sub = await h.subscribe(h.wsClient(ann.token), RUN_EVENTS);
      await h.ok(ann.token, TRY, { input: input({ name: "Draft", steps: [callB(b)] }) });
      await sub.waitFor((e) => e.data?.routineRunChanged.run.status === "OK");
      expect(h.drivers.KASA.commands).toEqual([{ deviceId: lamp, patch: { on: true } }]);
    });
  });
});

describe("condition steps", () => {
  const PIN = `mutation { updateWeatherSettings(input: { lat: 9.93, lng: -84.08, refreshMinutes: 15, staleMinutes: 45, enabled: true }) { lat } }`;
  const CREDS = `mutation { setXweatherCredentials(clientId: "id", clientSecret: "secret") { xweatherConfigured } }`;
  const NOTES = `query($id: ID!) { routine(id: $id) { lastRun { status notes { step routineName kind conditions ranRoutineName } } } }`;
  const warm = [{ metric: "TEMP_C", op: "ABOVE", value: 20 }];

  it("the last run keeps its notes; a branch routine the viewer can't see is Another routine", async () => {
    h = await ApiHarness.start({ weatherFetch: async () => SAMPLE_WEATHER });
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    await h.ok(root.token, CREDS);
    await h.ok(root.token, PIN);
    const secret = (await h.ok(root.token, CREATE, { input: input({ name: "Secret", scope: "SHARED", steps: [setOn(lamp)], audience: [] }) })).createRoutine.id;
    const top = (await h.ok(root.token, CREATE, { input: input({ name: "Top", scope: "SHARED", steps: [{ kind: "IF", conditions: warm, thenRoutineId: secret }], audience: [ann.id] }) })).createRoutine.id;
    await h.ok(root.token, RUN, { id: top });
    await lastRun(root.token, top, "OK");
    const note = { step: 0, routineName: null, kind: "IF_MET", conditions: "temperature above 20°" };
    expect((await h.ok(root.token, NOTES, { id: top })).routine.lastRun.notes).toEqual([{ ...note, ranRoutineName: "Secret" }]);
    expect((await h.ok(ann.token, NOTES, { id: top })).routine.lastRun.notes).toEqual([{ ...note, ranRoutineName: "Another routine" }]);
  });

  it("without weather the check is a WEATHER_UNAVAILABLE problem", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [{ kind: "CONTINUE_IF", conditions: warm }, setOn(lamp)] }) })).createRoutine.id;
    await h.ok(ann.token, RUN, { id });
    const run = await lastRun(ann.token, id, "FAILED");
    expect(run.problems).toEqual([{ deviceName: null, reason: "WEATHER_UNAVAILABLE" }]);
    expect(h.drivers.KASA.commands).toEqual([]);
  });
});

