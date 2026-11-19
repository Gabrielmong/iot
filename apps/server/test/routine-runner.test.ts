import { describe, expect, it, vi } from "vitest";
import { coded } from "../src/api-errors.js";
import type { StatePatch } from "../src/devices/types.js";
import { outcome } from "../src/routines/run-outcome.js";
import { RoutineRunner, type RunAs, type RunnerDeps, type RunSnapshot } from "../src/routines/runner.js";
import type { Condition } from "../src/routines/conditions.js";
import type { RoutineStep } from "../src/routines/steps.js";
import type { WeatherFacts } from "../src/weather/service.js";
import { SAMPLE_WEATHER } from "./fixtures/weather.js";

type Device = { id: string; name: string; kind: "LIGHT" | "PLUG" | "CAMERA"; brand: "TUYA" | "KASA" | "SWANN" };

type Called = { name: string; steps: RoutineStep[] } | "NO_ACCESS" | "THROW";

const NOW = new Date(2026, 10, 9, 20, 0);
const weatherAt = (tempC: number | null): WeatherFacts => ({
  reading: tempC === null ? null : { ...SAMPLE_WEATHER, current: { ...SAMPLE_WEATHER.current, tempC }, fetchedAt: NOW, lat: 9.93, lng: -84.08 },
  location: { lat: 9.93, lng: -84.08 },
  now: NOW,
});

function setup(devices: Device[], routines: Record<string, Called> = {}, weather: WeatherFacts = weatherAt(24)) {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const routineCalls: { id: string; runAs: RunAs }[] = [];
  const accessCalls: string[] = [];
  const commands: { deviceId: string; patch: StatePatch }[] = [];
  const waits: { ms: number; release: () => void }[] = [];
  const events: { key: string; run: RunSnapshot }[] = [];
  const access = new Set(devices.map((d) => d.id));
  let setStateImpl: (deviceId: string) => Promise<void> = async () => {};
  const deps: RunnerDeps = {
    setState: async (deviceId, patch) => {
      commands.push({ deviceId, patch });
      await setStateImpl(deviceId);
    },
    device: async (id) => byId.get(id) ?? null,
    canAccess: async (userId, deviceId) => {
      accessCalls.push(userId);
      return access.has(deviceId);
    },
    canPower: async (_userId, deviceId) => access.has(deviceId),
    pcPower: () => {},
    routine: async (id, runAs) => {
      routineCalls.push({ id, runAs });
      if (routines[id] === "THROW") throw new Error("db down");
      return routines[id] ?? null;
    },
    delay: (ms, signal) =>
      new Promise((resolve, reject) => {
        waits.push({ ms, release: resolve });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    now: () => NOW,
    weather: () => weather,
    onChange: (key, run) => void events.push({ key, run: structuredClone(run) }),
  };
  return {
    runner: new RoutineRunner(deps),
    commands,
    waits,
    events,
    access,
    routineCalls,
    accessCalls,
    /** Status changes (repeated RUNNING events for later steps collapse into one). */
    statuses: (key = "r1") =>
      events
        .filter((e) => e.key === key)
        .map((e) => e.run.status)
        .filter((s, i, all) => i === 0 || s !== all[i - 1]),
    failWith: (impl: (deviceId: string) => Promise<void>) => void (setStateImpl = impl),
  };
}

const lamp: Device = { id: "lamp", name: "Lamp", kind: "LIGHT", brand: "TUYA" };
const tv: Device = { id: "tv", name: "TV", kind: "PLUG", brand: "KASA" };
const set = (...actions: { deviceId: string; on?: boolean; brightness?: number }[]): RoutineStep => ({ kind: "SET", actions });
const wait = (minutes: number): RoutineStep => ({ kind: "WAIT", minutes });
const call = (routineId: string): RoutineStep => ({ kind: "ROUTINE", routineId });

describe("RoutineRunner", () => {
  it("issues every action in a step before any completes", async () => {
    const t = setup([lamp, tv]);
    t.failWith(() => new Promise(() => {})); // hang
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }, { deviceId: "tv", on: true })], null);
    await vi.waitFor(() => expect(t.commands.map((c) => c.deviceId).sort()).toEqual(["lamp", "tv"]));
  });

  it("reports the current step, when a wait ends, and who started it", async () => {
    const t = setup([lamp]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), wait(45), set({ deviceId: "lamp", on: false })], null, "Ann");
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    const steps = () => t.events.map((e) => [e.run.status, e.run.currentStep, e.run.waitUntil?.toISOString() ?? null]);
    const end = new Date(2026, 10, 9, 20, 45).toISOString();
    expect(steps()).toEqual([
      ["RUNNING", 0, null],
      ["RUNNING", 1, end],
    ]);
    t.waits[0]!.release();
    await vi.waitFor(() => expect(t.statuses()).toContain("OK"));
    expect(steps().slice(2)).toEqual([
      ["RUNNING", 2, null],
      ["OK", null, null],
    ]);
    expect(t.events.every((e) => e.run.startedBy === "Ann")).toBe(true);
  });

  it("waits between steps and finishes OK", async () => {
    const t = setup([lamp]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), wait(45), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    expect(t.waits[0]!.ms).toBe(45 * 60_000);
    expect(t.commands).toEqual([{ deviceId: "lamp", patch: { on: true } }]);
    t.waits[0]!.release();
    await vi.waitFor(() => expect(t.statuses().at(-1)).toBe("OK"));
    expect(t.commands[1]).toEqual({ deviceId: "lamp", patch: { on: false } });
    expect(t.runner.isRunning("r1")).toBe(false);
  });

  it("records problems and keeps going", async () => {
    const t = setup([lamp, tv]);
    t.failWith(async (id) => {
      if (id === "tv") throw coded("DEVICE_UNREACHABLE", "unreachable");
    });
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }, { deviceId: "tv", on: true }), set({ deviceId: "gone", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([
      { step: 0, deviceId: "tv", deviceName: "TV", reason: "UNREACHABLE", routineName: null },
      { step: 1, deviceId: "gone", deviceName: "Removed device", reason: "REMOVED", routineName: null },
    ]);
  });

  it("reports FAILED when every device fails", async () => {
    const t = setup([tv]);
    t.failWith(async () => {
      throw coded("DEVICE_NOT_READY", "not ready");
    });
    t.runner.start("r1", [set({ deviceId: "tv", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "FAILED"]));
    expect(t.events.at(-1)!.run.problems[0]!.reason).toBe("NOT_READY");
  });

  it("checks access per Set step for personal runs", async () => {
    const t = setup([lamp]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), wait(1), set({ deviceId: "lamp", on: false })], { userId: "ann" });
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    t.access.delete("lamp");
    t.waits[0]!.release();
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.commands).toHaveLength(1);
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 2, deviceId: "lamp", deviceName: "Lamp", reason: "NO_ACCESS", routineName: null }]);
  });

  it("ignores access for full-access runs", async () => {
    const t = setup([lamp]);
    t.access.clear();
    t.runner.start("r1", [set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
  });

  it("sends only supported fields after a kind change", async () => {
    const t = setup([{ ...lamp, kind: "PLUG", brand: "KASA" }]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true, brightness: 20 }), set({ deviceId: "lamp", brightness: 20 })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.commands).toEqual([{ deviceId: "lamp", patch: { on: true } }]);
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 1, deviceId: "lamp", deviceName: "Lamp", reason: "NOT_READY", routineName: null }]);
  });

  it("stop aborts a wait and reports STOPPED", async () => {
    const t = setup([lamp]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), wait(10), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    expect(t.runner.stop("r1")).toBe(true);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "STOPPED"]));
    expect(t.commands).toHaveLength(1);
    expect(t.runner.stop("r1")).toBe(false);
  });

  it("a stale run never publishes after being replaced", async () => {
    const t = setup([lamp]);
    let releaseFirst!: () => void;
    t.failWith(() => new Promise<void>((resolve) => (releaseFirst = resolve)));
    t.runner.start("r1", [set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.commands).toHaveLength(1));
    const first = releaseFirst;
    t.failWith(async () => {});
    t.runner.start("r1", [set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    const seen = t.events.length;
    first();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.events).toHaveLength(seen);
  });

  it("stopAll aborts without events", async () => {
    const t = setup([lamp]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), wait(10)], null);
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    t.runner.stopAll();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.statuses()).toEqual(["RUNNING"]);
    expect(t.runner.isRunning("r1")).toBe(false);
  });
});

describe("RoutineRunner: called routines", () => {
  it("runs a called routine inline and reports where it is", async () => {
    const t = setup([lamp, tv], { r2: { name: "R2", steps: [wait(5), set({ deviceId: "tv", on: true })] } });
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), call("r2")], null);
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    expect(t.waits[0]!.ms).toBe(5 * 60_000);
    const atWait = t.events.at(-1)!.run;
    expect(atWait.currentStep).toBe(1);
    expect(atWait.currentPath).toEqual([{ routineName: "R2", step: 0, stepCount: 2 }]);
    expect(atWait.waitUntil).toEqual(new Date(2026, 10, 9, 20, 5));
    expect(t.events[0]!.run.currentPath).toEqual([]);
    t.waits[0]!.release();
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    expect(t.commands.map((c) => c.deviceId)).toEqual(["lamp", "tv"]);
    expect(t.events.filter((e) => e.run.status === "OK")).toHaveLength(1);
    expect(t.events.at(-1)!.run.currentPath).toEqual([]);
  });

  it("stop while waiting inside a called routine stops the whole chain", async () => {
    const t = setup([lamp, tv], { r2: { name: "R2", steps: [wait(5), set({ deviceId: "tv", on: true })] } });
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), call("r2"), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.waits).toHaveLength(1));
    expect(t.runner.stop("r1")).toBe(true);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "STOPPED"]));
    await new Promise((r) => setTimeout(r, 10));
    expect(t.commands.map((c) => c.deviceId)).toEqual(["lamp"]);
    expect(t.statuses()).toEqual(["RUNNING", "STOPPED"]);
  });

  it("a removed routine is a problem and later steps still run", async () => {
    const t = setup([lamp]);
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), call("r2"), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 1, reason: "ROUTINE_REMOVED", deviceId: null, deviceName: null, routineName: null }]);
    expect(t.commands).toHaveLength(2);
  });

  it("only a removed routine means FAILED", async () => {
    const t = setup([]);
    t.runner.start("r1", [call("r2")], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "FAILED"]));
  });

  it("a routine the runner can't use is NO_ACCESS", async () => {
    const t = setup([lamp], { r2: "NO_ACCESS" });
    t.runner.start("r1", [call("r2"), set({ deviceId: "lamp", on: true })], { userId: "ann" });
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 0, reason: "NO_ACCESS", deviceId: null, deviceName: null, routineName: null }]);
  });

  it("a routine that fails to load is UNREACHABLE and later steps still run", async () => {
    const t = setup([lamp], { r2: "THROW" });
    t.runner.start("r1", [call("r2"), set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 0, reason: "UNREACHABLE", deviceId: null, deviceName: null, routineName: null }]);
    expect(t.commands).toHaveLength(1);
    expect(t.runner.isRunning("r1")).toBe(false);
  });

  it("a device problem inside a called routine names that routine", async () => {
    const t = setup([lamp], { r2: { name: "R2", steps: [set({ deviceId: "gone", on: true })] } });
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), call("r2")], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 1, deviceId: "gone", deviceName: "Removed device", reason: "REMOVED", routineName: "R2" }]);
  });

  it("stops nesting past the limit", async () => {
    const t = setup([lamp], {
      r2: { name: "R2", steps: [call("r3")] },
      r3: { name: "R3", steps: [set({ deviceId: "lamp", on: true }), call("r4")] },
      r4: { name: "R4", steps: [set({ deviceId: "lamp", on: false })] },
    });
    t.runner.start("r1", [call("r2")], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 0, reason: "NESTED_TOO_DEEP", deviceId: null, deviceName: null, routineName: "R3" }]);
    expect(t.routineCalls.map((c) => c.id)).toEqual(["r2", "r3"]);
    expect(t.commands).toEqual([{ deviceId: "lamp", patch: { on: true } }]);
  });

  it("runs called routines as the caller", async () => {
    const t = setup([lamp], { r2: { name: "R2", steps: [set({ deviceId: "lamp", on: true })] } });
    t.runner.start("r1", [call("r2")], { userId: "ann" });
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    expect(t.routineCalls).toEqual([{ id: "r2", runAs: { userId: "ann" } }]);
    expect(t.accessCalls).toEqual(["ann"]);
  });
});

describe("outcome", () => {
  it("is OK without problems, FAILED when everything failed, else PARTIAL", () => {
    const p = { step: 0, deviceId: "a", deviceName: "A", reason: "UNREACHABLE" as const, routineName: null };
    expect(outcome(0, [])).toBe("OK");
    expect(outcome(2, [])).toBe("OK");
    expect(outcome(2, [p])).toBe("PARTIAL");
    expect(outcome(2, [p, p])).toBe("FAILED");
  });
});

const hot: Condition[] = [{ metric: "TEMP_C", op: "ABOVE", value: 28 }];
const continueIf = (conditions: Condition[] = hot): RoutineStep => ({ kind: "CONTINUE_IF", conditions });
const ifThen = (thenRoutineId: string, elseRoutineId: string | null = null): RoutineStep => ({ kind: "IF", conditions: hot, thenRoutineId, elseRoutineId });

describe("condition steps", () => {
  it("a Continue-only-if that isn't met ends the run OK and notes why", async () => {
    const t = setup([lamp], {}, weatherAt(20));
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), continueIf(), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    expect(t.commands).toHaveLength(1);
    expect(t.events.at(-1)!.run.notes).toEqual([{ step: 1, routineName: null, kind: "STOPPED", conditions: "temperature above 28°", ranRoutineName: null }]);
  });

  it("a met Continue-only-if carries on", async () => {
    const t = setup([lamp], {}, weatherAt(30));
    t.runner.start("r1", [continueIf(), set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    expect(t.commands).toHaveLength(1);
    expect(t.events.at(-1)!.run.notes).toEqual([]);
  });

  it("stopping after a step with a problem is PARTIAL", async () => {
    const t = setup([lamp], {}, weatherAt(20));
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }, { deviceId: "gone", on: true }), continueIf(), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
  });

  it("unknown weather is a problem and stops the routine", async () => {
    const t = setup([lamp], {}, weatherAt(null));
    t.runner.start("r1", [set({ deviceId: "lamp", on: true }), continueIf(), set({ deviceId: "lamp", on: false })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 1, deviceId: null, deviceName: null, reason: "WEATHER_UNAVAILABLE", routineName: null }]);
    expect(t.commands).toHaveLength(1);
  });

  it("a routine that only checks unknown weather FAILS", async () => {
    const t = setup([], { r2: { name: "Fan", steps: [] } }, weatherAt(null));
    t.runner.start("r1", [ifThen("r2")], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "FAILED"]));
    expect(t.routineCalls).toEqual([]);
  });

  it("an If runs the then-routine when met, the else-routine when not", async () => {
    const routines = { fan: { name: "Fan", steps: [set({ deviceId: "tv", on: true })] }, heat: { name: "Heat", steps: [set({ deviceId: "lamp", on: true })] } };
    const met = setup([lamp, tv], routines, weatherAt(30));
    met.runner.start("r1", [ifThen("fan", "heat")], null);
    await vi.waitFor(() => expect(met.statuses()).toEqual(["RUNNING", "OK"]));
    expect(met.commands.map((c) => c.deviceId)).toEqual(["tv"]);
    expect(met.events.at(-1)!.run.notes).toEqual([{ step: 0, routineName: null, kind: "IF_MET", conditions: "temperature above 28°", ranRoutineName: "Fan" }]);
    const notMet = setup([lamp, tv], routines, weatherAt(20));
    notMet.runner.start("r1", [ifThen("fan", "heat")], null);
    await vi.waitFor(() => expect(notMet.statuses()).toEqual(["RUNNING", "OK"]));
    expect(notMet.commands.map((c) => c.deviceId)).toEqual(["lamp"]);
    expect(notMet.events.at(-1)!.run.notes[0]).toMatchObject({ kind: "IF_NOT_MET", ranRoutineName: "Heat" });
  });

  it("an If that isn't met without an else runs nothing and carries on", async () => {
    const t = setup([lamp], { fan: { name: "Fan", steps: [] } }, weatherAt(20));
    t.runner.start("r1", [ifThen("fan"), set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    expect(t.routineCalls).toEqual([]);
    expect(t.commands).toHaveLength(1);
    expect(t.events.at(-1)!.run.notes).toEqual([{ step: 0, routineName: null, kind: "IF_NOT_MET", conditions: "temperature above 28°", ranRoutineName: null }]);
  });

  it("a stop inside a called routine stops only that routine", async () => {
    const t = setup([lamp, tv], { inner: { name: "Inner", steps: [continueIf(), set({ deviceId: "tv", on: true })] } }, weatherAt(20));
    t.runner.start("r1", [call("inner"), set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "OK"]));
    expect(t.commands.map((c) => c.deviceId)).toEqual(["lamp"]);
    expect(t.events.at(-1)!.run.notes).toEqual([{ step: 0, routineName: "Inner", kind: "STOPPED", conditions: "temperature above 28°", ranRoutineName: null }]);
  });

  it("an If whose routine was removed is a problem and the run carries on", async () => {
    const t = setup([lamp], {}, weatherAt(30));
    t.runner.start("r1", [ifThen("gone"), set({ deviceId: "lamp", on: true })], null);
    await vi.waitFor(() => expect(t.statuses()).toEqual(["RUNNING", "PARTIAL"]));
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 0, deviceId: null, deviceName: null, reason: "ROUTINE_REMOVED", routineName: null }]);
    expect(t.commands).toHaveLength(1);
  });
});

