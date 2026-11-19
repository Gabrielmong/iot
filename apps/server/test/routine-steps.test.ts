import { describe, expect, it } from "vitest";
import { assertActionFits, canUseInRoutine, fitAction, supportsLightDetails } from "../src/routines/action-rules.js";
import { parseSteps, stepRoutineIds, type StepInput } from "../src/routines/steps.js";

const set = (...deviceIds: string[]): StepInput => ({ kind: "SET", actions: deviceIds.map((deviceId) => ({ deviceId, on: true })) });
const wait = (waitMinutes: number): StepInput => ({ kind: "WAIT", waitMinutes });
const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return null;
};

describe("parseSteps", () => {
  it("accepts 20 steps and rejects 21", () => {
    const twenty = [set("a"), ...Array.from({ length: 19 }, () => wait(1))];
    expect(parseSteps(twenty)).toHaveLength(20);
    expect(message(() => parseSteps([...twenty, wait(1)]))).toBe("A routine can have at most 20 steps");
  });

  it("rejects more than 50 devices in a step", () => {
    const ids = Array.from({ length: 51 }, (_, i) => `d${i}`);
    expect(parseSteps([set(...ids.slice(0, 50))])[0]).toMatchObject({ kind: "SET" });
    expect(message(() => parseSteps([set(...ids)]))).toBe("A step can set at most 50 devices");
  });

  it("rejects a device twice in one step", () => {
    expect(message(() => parseSteps([set("a", "a")]))).toBe("A device can appear only once per step");
  });

  it("accepts waits of 1 to 720 minutes", () => {
    expect(parseSteps([set("a"), wait(1), wait(720)]).slice(1)).toEqual([
      { kind: "WAIT", minutes: 1 },
      { kind: "WAIT", minutes: 720 },
    ]);
    expect(message(() => parseSteps([set("a"), wait(0)]))).toBe("Waits must be 1 to 720 minutes");
    expect(message(() => parseSteps([set("a"), wait(721)]))).toBe("Waits must be 1 to 720 minutes");
  });

  it("rejects color together with white temperature", () => {
    const step: StepInput = { kind: "SET", actions: [{ deviceId: "a", color: { r: 1, g: 2, b: 3 }, colorTempK: 3000 }] };
    expect(message(() => parseSteps([step]))).toBe("Pick a color or a white temperature, not both");
  });

  it("rejects brightness outside 1-100", () => {
    for (const brightness of [0, 101]) {
      expect(message(() => parseSteps([{ kind: "SET", actions: [{ deviceId: "a", brightness }] }]))).toBe("Brightness must be 1-100");
    }
  });

  it("rejects an action that changes nothing", () => {
    expect(message(() => parseSteps([{ kind: "SET", actions: [{ deviceId: "a", on: null }] }]))).toBe("Each device must change something");
  });

  it("drops other settings when switching off", () => {
    const [step] = parseSteps([{ kind: "SET", actions: [{ deviceId: "a", on: false, brightness: 50 }] }]);
    expect(step).toEqual({ kind: "SET", actions: [{ deviceId: "a", on: false }] });
  });

  it("keeps leave-as-is power with other settings", () => {
    const [step] = parseSteps([{ kind: "SET", actions: [{ deviceId: "a", on: null, brightness: 20, colorTempK: 2700 }] }]);
    expect(step).toEqual({ kind: "SET", actions: [{ deviceId: "a", brightness: 20, colorTempK: 2700 }] });
  });

  it("needs a device or a routine", () => {
    expect(message(() => parseSteps([]))).toBe("Add a device or a routine");
    expect(message(() => parseSteps([{ kind: "SET", actions: [] }, wait(5)]))).toBe("Add a device or a routine");
    expect(message(() => parseSteps([{ kind: "WAIT", waitMinutes: 5 }]))).toBe("Add a device or a routine");
  });

  it("accepts a routine made only of Run routine steps", () => {
    expect(parseSteps([{ kind: "ROUTINE", routineId: "r2" }])).toEqual([{ kind: "ROUTINE", routineId: "r2" }]);
  });

  it("rejects a Run routine step with no routine", () => {
    expect(message(() => parseSteps([{ kind: "ROUTINE" }]))).toBe("Pick a routine to run");
    expect(message(() => parseSteps([{ kind: "ROUTINE", routineId: "" }]))).toBe("Pick a routine to run");
  });
});

describe("stepRoutineIds", () => {
  it("lists called routines once, in order", () => {
    const steps = parseSteps([set("a"), { kind: "ROUTINE", routineId: "r2" }, { kind: "ROUTINE", routineId: "r3" }, { kind: "ROUTINE", routineId: "r2" }]);
    expect(stepRoutineIds(steps)).toEqual(["r2", "r3"]);
  });
});

describe("action rules", () => {
  const plug = { kind: "PLUG", brand: "KASA" } as const;
  const tuyaLight = { kind: "LIGHT", brand: "TUYA" } as const;
  const kasaLight = { kind: "LIGHT", brand: "KASA" } as const;

  it("only Govee and Tuya lights take brightness and color", () => {
    expect(supportsLightDetails(tuyaLight)).toBe(true);
    expect(supportsLightDetails({ kind: "LIGHT", brand: "GOVEE" })).toBe(true);
    expect(supportsLightDetails(kasaLight)).toBe(false);
    expect(supportsLightDetails(plug)).toBe(false);
  });

  it("allows switchable devices but not cameras, unknowns or power-strip parents", () => {
    expect(canUseInRoutine({ ...plug, hasAdoptedChildren: false })).toBe(true);
    expect(canUseInRoutine({ ...plug, hasAdoptedChildren: true })).toBe(false);
    expect(canUseInRoutine({ kind: "CAMERA", brand: "SWANN", hasAdoptedChildren: false })).toBe(false);
    expect(canUseInRoutine({ kind: "UNKNOWN", brand: "TUYA", hasAdoptedChildren: false })).toBe(false);
  });

  it("assertActionFits names the device", () => {
    expect(message(() => assertActionFits({ deviceId: "p", brightness: 20 }, plug, "TV plug"))).toBe("TV plug can only be switched on or off");
    expect(message(() => assertActionFits({ deviceId: "k", on: true, brightness: 20 }, kasaLight, "Hall"))).toBe("Hall can only be switched on or off");
    expect(message(() => assertActionFits({ deviceId: "t", color: { r: 1, g: 2, b: 3 } }, tuyaLight, "Lamp"))).toBeNull();
  });

  it("fitAction keeps only fields the device supports now", () => {
    expect(fitAction({ deviceId: "p", on: true, brightness: 20 }, plug)).toEqual({ deviceId: "p", on: true });
    expect(fitAction({ deviceId: "p", brightness: 20 }, plug)).toBeNull();
    expect(fitAction({ deviceId: "t", brightness: 20 }, tuyaLight)).toEqual({ deviceId: "t", brightness: 20 });
    expect(fitAction({ deviceId: "c", on: true }, { kind: "CAMERA", brand: "SWANN" })).toBeNull();
  });
});

describe("condition steps", () => {
  const hot = [{ metric: "TEMP_C", op: "ABOVE", value: 28 }];

  it("an If needs a routine to run", () => {
    expect(message(() => parseSteps([set("a"), { kind: "IF", conditions: hot }]))).toBe("Pick a routine to run");
  });

  it("an If counts as running a routine; a Continue-only-if alone does not", () => {
    expect(parseSteps([{ kind: "IF", conditions: hot, thenRoutineId: "r1" }])).toEqual([
      { kind: "IF", conditions: [{ metric: "TEMP_C", op: "ABOVE", value: 28 }], thenRoutineId: "r1", elseRoutineId: null },
    ]);
    expect(message(() => parseSteps([{ kind: "CONTINUE_IF", conditions: hot }]))).toBe("Add a device or a routine");
  });

  it("checks the conditions", () => {
    expect(message(() => parseSteps([set("a"), { kind: "CONTINUE_IF", conditions: [] }]))).toBe("Add 1 to 5 conditions");
  });

  it("lists an If's then and else routines", () => {
    const steps = parseSteps([{ kind: "IF", conditions: hot, thenRoutineId: "r1", elseRoutineId: "r2" }, { kind: "ROUTINE", routineId: "r1" }]);
    expect(stepRoutineIds(steps)).toEqual(["r1", "r2"]);
  });
});
