import { badInput } from "../api-errors.js";

export type Rgb = { r: number; g: number; b: number };
/** What one device is set to. An absent `on` leaves power as it is. */
export type DeviceAction = { deviceId: string; on?: boolean; brightness?: number; color?: Rgb; colorTempK?: number };
export type RoutineStep = { kind: "SET"; actions: DeviceAction[] } | { kind: "WAIT"; minutes: number } | { kind: "ROUTINE"; routineId: string };

export type ActionInput = { deviceId: string; on?: boolean | null; brightness?: number | null; color?: Rgb | null; colorTempK?: number | null };
export type StepInput = { kind: "SET" | "WAIT" | "ROUTINE"; waitMinutes?: number | null; actions?: ActionInput[] | null; routineId?: string | null };

export const LIMITS = { maxSteps: 20, maxDevicesPerStep: 50, minWait: 1, maxWait: 720, maxNesting: 3 } as const;

const isInt = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/** Validates the steps' shape and limits (no database checks) and normalizes each action. */
export function parseSteps(input: StepInput[]): RoutineStep[] {
  if (input.length > LIMITS.maxSteps) throw badInput(`A routine can have at most ${LIMITS.maxSteps} steps`);
  const steps = input.map(parseStep);
  if (!steps.some((s) => (s.kind === "SET" && s.actions.length > 0) || s.kind === "ROUTINE")) throw badInput("Add a device or a routine");
  return steps;
}

function parseStep(input: StepInput): RoutineStep {
  if (input.kind === "WAIT") {
    const minutes = input.waitMinutes ?? 0;
    if (!isInt(minutes, LIMITS.minWait, LIMITS.maxWait)) throw badInput(`Waits must be ${LIMITS.minWait} to ${LIMITS.maxWait} minutes`);
    return { kind: "WAIT", minutes };
  }
  if (input.kind === "ROUTINE") {
    if (!input.routineId) throw badInput("Pick a routine to run");
    return { kind: "ROUTINE", routineId: input.routineId };
  }
  const actions = (input.actions ?? []).map(parseAction);
  if (actions.length > LIMITS.maxDevicesPerStep) throw badInput(`A step can set at most ${LIMITS.maxDevicesPerStep} devices`);
  if (new Set(actions.map((a) => a.deviceId)).size !== actions.length) throw badInput("A device can appear only once per step");
  return { kind: "SET", actions };
}

function parseAction(input: ActionInput): DeviceAction {
  if (input.on === false) return { deviceId: input.deviceId, on: false };
  const action: DeviceAction = { deviceId: input.deviceId };
  if (input.on === true) action.on = true;
  if (input.brightness != null) {
    if (!isInt(input.brightness, 1, 100)) throw badInput("Brightness must be 1-100");
    action.brightness = input.brightness;
  }
  if (input.color != null && input.colorTempK != null) throw badInput("Pick a color or a white temperature, not both");
  if (input.color != null) {
    const { r, g, b } = input.color;
    if (![r, g, b].every((c) => isInt(c, 0, 255))) throw badInput("Color channels must be 0-255");
    action.color = { r, g, b };
  }
  if (input.colorTempK != null) {
    if (!isInt(input.colorTempK, 1000, 10000)) throw badInput("White temperature must be 1000-10000 K");
    action.colorTempK = input.colorTempK;
  }
  if (Object.keys(action).length === 1) throw badInput("Each device must change something");
  return action;
}

/** Every device id the steps use. */
export function stepDeviceIds(steps: RoutineStep[]): string[] {
  return [...new Set(steps.flatMap((s) => (s.kind === "SET" ? s.actions.map((a) => a.deviceId) : [])))];
}

/** Every routine id the steps run, once each, in order. */
export function stepRoutineIds(steps: RoutineStep[]): string[] {
  return [...new Set(steps.flatMap((s) => (s.kind === "ROUTINE" ? [s.routineId] : [])))];
}
