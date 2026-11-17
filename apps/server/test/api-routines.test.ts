import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const FIELDS = `id name scope editable audience room { id } owner { id }
  steps { kind waitMinutes actions { deviceId on brightness color { r g b } colorTempK } }
  schedules { time days enabled }`;
const LIST = `{ routines { ${FIELDS} } }`;
const OTHERS = `{ otherRoutines { ${FIELDS} } }`;
const ONE = `query($id: ID!) { routine(id: $id) { ${FIELDS} } }`;
const CREATE = `mutation($input: RoutineInput!) { createRoutine(input: $input) { ${FIELDS} } }`;
const UPDATE = `mutation($id: ID!, $input: RoutineInput!) { updateRoutine(id: $id, input: $input) { ${FIELDS} } }`;
const DELETE = `mutation($id: ID!) { deleteRoutine(id: $id) }`;

const setOn = (...deviceIds: string[]) => ({ kind: "SET", actions: deviceIds.map((deviceId) => ({ deviceId, on: true })) });
const input = (over: Record<string, unknown> = {}) => ({ name: "Movie night", scope: "PERSONAL", roomId: null, steps: [], schedules: [], ...over });

describe("routines API", () => {
  it("a user creates, reads, updates and deletes a personal routine", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const steps = [setOn(lamp), { kind: "WAIT", waitMinutes: 45 }, { kind: "SET", actions: [{ deviceId: lamp, on: false }] }];
    const created = (await h.ok(ann.token, CREATE, { input: input({ steps, schedules: [{ time: "07:00", days: [1, 2, 3, 4, 5] }] }) })).createRoutine;
    expect(created).toMatchObject({
      name: "Movie night",
      scope: "PERSONAL",
      editable: true,
      owner: { id: ann.id },
      steps: [
        { kind: "SET", waitMinutes: null, actions: [{ deviceId: lamp, on: true, brightness: null, color: null, colorTempK: null }] },
        { kind: "WAIT", waitMinutes: 45, actions: [] },
        { kind: "SET", actions: [{ deviceId: lamp, on: false }] },
      ],
      schedules: [{ time: "07:00", days: [1, 2, 3, 4, 5], enabled: true }],
    });
    expect((await h.ok(ann.token, LIST)).routines.map((r: { id: string }) => r.id)).toEqual([created.id]);
    const updated = (await h.ok(ann.token, UPDATE, { id: created.id, input: input({ name: "Film", steps: [setOn(lamp)] }) })).updateRoutine;
    expect(updated).toMatchObject({ name: "Film", schedules: [] });
    expect((await h.ok(ann.token, DELETE, { id: created.id })).deleteRoutine).toBe(true);
    expect((await h.ok(ann.token, LIST)).routines).toEqual([]);
  });

  it("a user can't put an ungranted device in a routine", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    expect(codes(await h.gql(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) }))).toEqual(["FORBIDDEN"]);
  });

  it("a user can't create a shared routine", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    expect(codes(await h.gql(ann.token, CREATE, { input: input({ scope: "SHARED", steps: [setOn(lamp)] }) }))).toEqual(["FORBIDDEN"]);
  });

  it("a user doesn't see another user's personal routine", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    await h.grant(bob.id, lamp);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    expect((await h.ok(bob.token, ONE, { id })).routine).toBeNull();
    expect((await h.ok(bob.token, LIST)).routines).toEqual([]);
    expect(codes(await h.gql(bob.token, UPDATE, { id, input: input({ steps: [setOn(lamp)] }) }))).toEqual(["NOT_FOUND"]);
    expect(codes(await h.gql(bob.token, DELETE, { id }))).toEqual(["NOT_FOUND"]);
  });

  it("shared routines are visible only to their audience and admins", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    const shared = (await h.ok(root.token, CREATE, { input: input({ scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine;
    expect(shared).toMatchObject({ scope: "SHARED", owner: null, editable: true, audience: [ann.id] });
    expect((await h.ok(ann.token, LIST)).routines).toEqual([expect.objectContaining({ id: shared.id, editable: false, audience: [] })]);
    expect((await h.ok(bob.token, LIST)).routines).toEqual([]);
    expect(codes(await h.gql(ann.token, UPDATE, { id: shared.id, input: input({ scope: "SHARED", steps: [setOn(lamp)] }) }))).toEqual(["FORBIDDEN"]);
  });

  it("rejects an audience member who isn't a regular user", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const lamp = await h.device();
    const r = await h.gql(root.token, CREATE, { input: input({ scope: "SHARED", steps: [setOn(lamp)], audience: [root.id] }) });
    expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
  });

  it("admin sees others' personal routines only in otherRoutines", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    expect((await h.ok(root.token, LIST)).routines).toEqual([]);
    expect((await h.ok(root.token, OTHERS)).otherRoutines).toEqual([expect.objectContaining({ id, editable: true, owner: { id: ann.id } })]);
    expect(codes(await h.gql(ann.token, OTHERS))).toEqual(["FORBIDDEN"]);
  });

  it("admin editing a personal routine is checked against the owner's grants", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const lamp = await h.device();
    const fan = await h.device();
    await h.grant(ann.id, lamp);
    const id = (await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    expect(codes(await h.gql(root.token, UPDATE, { id, input: input({ steps: [setOn(lamp, fan)] }) }))).toEqual(["FORBIDDEN"]);
    const ok = (await h.ok(root.token, UPDATE, { id, input: input({ name: "Renamed", steps: [setOn(lamp)] }) })).updateRoutine;
    expect(ok).toMatchObject({ name: "Renamed", owner: { id: ann.id } });
  });

  it("duplicate name for the same owner is rejected; same name for different owners is fine", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    await h.grant(bob.id, lamp);
    await h.ok(ann.token, CREATE, { input: input({ steps: [setOn(lamp)] }) });
    expect(codes(await h.gql(ann.token, CREATE, { input: input({ name: " Movie night ", steps: [setOn(lamp)] }) }))).toEqual(["BAD_USER_INPUT"]);
    await h.ok(bob.token, CREATE, { input: input({ steps: [setOn(lamp)] }) });
  });

  it("scope can't change on update", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const lamp = await h.device();
    const id = (await h.ok(root.token, CREATE, { input: input({ steps: [setOn(lamp)] }) })).createRoutine.id;
    expect(codes(await h.gql(root.token, UPDATE, { id, input: input({ scope: "SHARED", steps: [setOn(lamp)] }) }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("TVs and computers can be used; a computer can only be woken", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const tv = await h.device({ kind: "TV", brand: "ANDROID_TV" });
    const pc = await h.device({ kind: "COMPUTER", brand: "WOL", name: "Office PC", config: { mac: "aa:bb:cc:dd:ee:ff" } });
    const id = (await h.ok(root.token, CREATE, { input: input({ steps: [setOn(tv, pc)] }) })).createRoutine.id;
    expect(id).toBeTruthy();
    const res = await h.gql(root.token, CREATE, { input: input({ name: "Off", steps: [{ kind: "SET", actions: [{ deviceId: pc, on: false }] }] }) });
    expect(codes(res)).toEqual(["BAD_USER_INPUT"]);
    expect(res.errors?.[0]?.message).toBe("Office PC can only be woken");
    expect(codes(await h.gql(root.token, CREATE, { input: input({ name: "Dim", steps: [{ kind: "SET", actions: [{ deviceId: pc, on: true, brightness: 50 }] }] }) }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(root.token, CREATE, { input: input({ name: "Dim TV", steps: [{ kind: "SET", actions: [{ deviceId: tv, on: true, brightness: 50 }] }] }) }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("a camera can't be added", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const cam = await h.device({ kind: "CAMERA", brand: "SWANN" });
    expect(codes(await h.gql(root.token, CREATE, { input: input({ steps: [setOn(cam)] }) }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("rejects an unknown room", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const lamp = await h.device();
    expect(codes(await h.gql(root.token, CREATE, { input: input({ roomId: "nope", steps: [setOn(lamp)] }) }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("routinesChanged fires on create", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const lamp = await h.device();
    const sub = await h.subscribe(h.wsClient(root.token), "subscription { routinesChanged }");
    await h.ok(root.token, CREATE, { input: input({ steps: [setOn(lamp)] }) });
    await sub.waitFor((e) => e.data?.routinesChanged === true);
  });

  it("says whether each step's device still exists", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const [keep, gone] = [await h.device(), await h.device()];
    const id = (await h.ok(root.token, CREATE, { input: input({ steps: [setOn(keep, gone)] }) })).createRoutine.id;
    await h.db.device.delete({ where: { id: gone } });
    const routine = (await h.ok(root.token, `query($id: ID!) { routine(id: $id) { steps { actions { deviceId deviceExists } } } }`, { id })).routine;
    expect(routine.steps[0].actions).toEqual([
      { deviceId: keep, deviceExists: true },
      { deviceId: gone, deviceExists: false },
    ]);
  });
});

const callStep = (routineId: string) => ({ kind: "ROUTINE", routineId });
const CALLABLE = `query($scope: RoutineScope!, $routineId: ID) { callableRoutines(scope: $scope, routineId: $routineId) { id name } }`;
const messages = (r: { errors?: { message: string }[] }) => (r.errors ?? []).map((e) => e.message);

describe("routines that run other routines", () => {
  it("a personal routine runs the owner's personal routines and the shared ones they see", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const mine = (await h.ok(ann.token, CREATE, { input: input({ name: "Mine", steps: [setOn(lamp)] }) })).createRoutine.id;
    const shared = (await h.ok(root.token, CREATE, { input: input({ name: "Lights", scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine.id;
    const caller = (await h.ok(ann.token, CREATE, { input: input({ name: "Both", steps: [callStep(mine), callStep(shared)] }) })).createRoutine;
    expect(caller.name).toBe("Both");
  });

  it("rejects routines the owner can't use", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    await h.grant(bob.id, lamp);
    const bobs = (await h.ok(bob.token, CREATE, { input: input({ name: "Bobs", steps: [setOn(lamp)] }) })).createRoutine.id;
    const hidden = (await h.ok(root.token, CREATE, { input: input({ name: "Hidden", scope: "SHARED", steps: [setOn(lamp)], audience: [bob.id] }) })).createRoutine.id;
    const sharedOk = (await h.ok(root.token, CREATE, { input: input({ name: "Open", scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) })).createRoutine.id;
    const mine = (await h.ok(ann.token, CREATE, { input: input({ name: "Mine", steps: [setOn(lamp)] }) })).createRoutine.id;
    for (const [id, name] of [[bobs, "Bobs"], [hidden, "Hidden"]]) {
      const r = await h.gql(ann.token, CREATE, { input: input({ name: "Caller", steps: [callStep(id)] }) });
      expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
      expect(messages(r)).toEqual([`You can't run ${name} from this routine`]);
    }
    const shares = await h.gql(root.token, CREATE, { input: input({ name: "Wide", scope: "SHARED", steps: [callStep(mine)], audience: [ann.id] }) });
    expect(messages(shares)).toEqual(["You can't run Mine from this routine"]);
    expect(sharedOk).toBeTruthy();
  });

  it("rejects an unknown routine", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const r = await h.gql(ann.token, CREATE, { input: input({ steps: [callStep("00000000-0000-0000-0000-000000000000")] }) });
    expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
    expect(messages(r)).toEqual(["Unknown routine"]);
  });

  it("hides the names of routines the saver can't see in a too-deep error", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    await h.grant(bob.id, lamp);
    const shared = async (name: string, steps: unknown[], audience: string[]) =>
      (await h.ok(root.token, CREATE, { input: input({ name, scope: "SHARED", steps, audience }) })).createRoutine.id;
    const u = await shared("U", [setOn(lamp)], [bob.id]);
    const t = await shared("T", [callStep(u)], [bob.id]);
    const s = await shared("S", [callStep(t)], [ann.id, bob.id]);
    const r = await h.gql(ann.token, CREATE, { input: input({ name: "A", steps: [callStep(s)] }) });
    expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
    expect(messages(r)).toEqual(["Routines can run other routines only 3 levels deep (A → S → Another routine → Another routine)"]);
  });

  it("rejects a loop and a chain that is too deep when updating", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    const make = async (name: string, steps: unknown[]) => (await h.ok(ann.token, CREATE, { input: input({ name, steps }) })).createRoutine.id;
    const d = await make("D", [setOn(lamp)]);
    const c = await make("C", [callStep(d)]);
    const b = await make("B", [callStep(c)]);
    const a = await make("A", [setOn(lamp)]);
    const tooDeep = await h.gql(ann.token, UPDATE, { id: a, input: input({ name: "A", steps: [callStep(b)] }) });
    expect(codes(tooDeep)).toEqual(["BAD_USER_INPUT"]);
    expect(messages(tooDeep)).toEqual(["Routines can run other routines only 3 levels deep (A → B → C → D)"]);
    await h.ok(ann.token, UPDATE, { id: b, input: input({ name: "B", steps: [setOn(lamp)] }) });
    await h.ok(ann.token, UPDATE, { id: a, input: input({ name: "A", steps: [callStep(b)] }) });
    const loop = await h.gql(ann.token, UPDATE, { id: b, input: input({ name: "B", steps: [callStep(a)] }) });
    expect(codes(loop)).toEqual(["BAD_USER_INPUT"]);
    expect(messages(loop)).toEqual(["A routine can't run itself (B → A → B)"]);
    const self = await h.gql(ann.token, UPDATE, { id: a, input: input({ name: "A", steps: [callStep(a)] }) });
    expect(messages(self)).toEqual(["You can't run A from this routine"]);
  });

  it("lists the routines that can be run, never the routine itself", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const lamp = await h.device();
    await h.grant(ann.id, lamp);
    await h.grant(bob.id, lamp);
    await h.ok(bob.token, CREATE, { input: input({ name: "Bobs", steps: [setOn(lamp)] }) });
    await h.ok(root.token, CREATE, { input: input({ name: "Hidden", scope: "SHARED", steps: [setOn(lamp)], audience: [bob.id] }) });
    await h.ok(root.token, CREATE, { input: input({ name: "Open", scope: "SHARED", steps: [setOn(lamp)], audience: [ann.id] }) });
    const zed = (await h.ok(ann.token, CREATE, { input: input({ name: "Zed", steps: [setOn(lamp)] }) })).createRoutine.id;
    await h.ok(ann.token, CREATE, { input: input({ name: "Abe", steps: [setOn(lamp)] }) });
    const names = (r: { callableRoutines: { name: string }[] }) => r.callableRoutines.map((o) => o.name);
    expect(names(await h.ok(ann.token, CALLABLE, { scope: "PERSONAL" }))).toEqual(["Abe", "Open", "Zed"]);
    expect(names(await h.ok(ann.token, CALLABLE, { scope: "PERSONAL", routineId: zed }))).toEqual(["Abe", "Open"]);
    expect(names(await h.ok(root.token, CALLABLE, { scope: "SHARED" }))).toEqual(["Hidden", "Open"]);
  });
});
