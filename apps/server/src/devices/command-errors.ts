import { coded } from "../api-errors.js";

export const deviceNotFound = (deviceId: string) => coded("NOT_FOUND", "Device not found", { deviceId });

export const deviceNotReady = (deviceId: string, reason: string) => coded("DEVICE_NOT_READY", `Device is not ready: ${reason}`, { deviceId });

export const deviceUnreachable = (deviceId: string) => coded("DEVICE_UNREACHABLE", "Device is unreachable", { deviceId });
