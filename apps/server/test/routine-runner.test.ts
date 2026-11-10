import { describe, expect, it, vi } from "vitest";
import { coded } from "../src/api-errors.js";
import type { StatePatch } from "../src/devices/types.js";
import { outcome } from "../src/routines/run-outcome.js";
import { RoutineRunner, type RunnerDeps, type RunSnapshot } from "../src/routines/runner.js";
import type { RoutineStep } from "../src/routines/steps.js";

type Device = { id: string; name: string; kind: "LIGHT" | "PLUG" | "CAMERA"; brand: "TUYA" | "KASA" | "SWANN" };

function setup(devices: Device[]) {
  const byId = new Map(devices.map((d) => [d.id, d]));
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
    canAccess: async (_userId, deviceId) => access.has(deviceId),
    delay: (ms, signal) =>
      new Promise((resolve, reject) => {
        waits.push({ ms, release: resolve });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    now: () => new Date(2026, 10, 9, 20, 0),
    onChange: (key, run) => void events.push({ key, run: structuredClone(run) }),
  };
  return {
    runner: new RoutineRunner(deps),
    commands,
    waits,
    events,
    access,
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
      { step: 0, deviceId: "tv", deviceName: "TV", reason: "UNREACHABLE" },
      { step: 1, deviceId: "gone", deviceName: "Removed device", reason: "REMOVED" },
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
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 2, deviceId: "lamp", deviceName: "Lamp", reason: "NO_ACCESS" }]);
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
    expect(t.events.at(-1)!.run.problems).toEqual([{ step: 1, deviceId: "lamp", deviceName: "Lamp", reason: "NOT_READY" }]);
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

describe("outcome", () => {
  it("is OK without problems, FAILED when everything failed, else PARTIAL", () => {
    const p = { step: 0, deviceId: "a", deviceName: "A", reason: "UNREACHABLE" as const };
    expect(outcome(0, [])).toBe("OK");
    expect(outcome(2, [])).toBe("OK");
    expect(outcome(2, [p])).toBe("PARTIAL");
    expect(outcome(2, [p, p])).toBe("FAILED");
  });
});
