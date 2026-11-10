import type { GraphQLError } from "graphql";
import { deviceNotReady, deviceUnreachable } from "./command-errors.js";
import { DeviceNotReadyError } from "./errors.js";
import type { DeviceRecord, Driver, DriverLog, StatePatch } from "./types.js";
import { withTimeout } from "./with-timeout.js";

export const COMMAND_TIMEOUT_MS = 3000;

export type CommandResult = { ok: true } | { ok: false; unreachable: boolean; error: GraphQLError };

/** Runs a driver command with the command timeout, logs any failure and classifies it. */
export function runCommand(driver: Driver, device: DeviceRecord, patch: StatePatch, log: DriverLog, timeoutMs = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return runDeviceCall(device, () => driver.setState(device, patch), log, timeoutMs);
}

/** Any device call (a state change, a TV key, an app launch) under the command timeout, classified. */
export async function runDeviceCall(device: DeviceRecord, call: () => Promise<void>, log: DriverLog, timeoutMs = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  try {
    await withTimeout(call(), timeoutMs);
    return { ok: true };
  } catch (err) {
    log.warn(`device ${device.id}: command failed: ${describeError(err)}`);
    if (err instanceof DeviceNotReadyError) return { ok: false, unreachable: false, error: deviceNotReady(device.id, err.message) };
    return { ok: false, unreachable: true, error: deviceUnreachable(device.id) };
  }
}

/** Name and message only: protocol errors carry no secrets, and stacks or causes are not needed here. */
function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
