import { TuyaCloudStreamUnavailableError } from "@home/protocols";
import { Go2rtcHttpError } from "./go2rtc/api.js";
import { CameraUnavailableError } from "./streams/errors.js";

/**
 * Why a camera request failed, safe for the server log: go2rtc's status (and its error text, already
 * stripped of anything URL-like), the Tuya error class and code behind a refused cloud stream, or
 * just the error's class. Other errors' messages are never included: they may carry a source URL.
 */
export function failureReason(err: unknown): string {
  if (err instanceof Go2rtcHttpError) return `go2rtc HTTP ${err.status}${err.detail ? `: ${err.detail}` : ""}`;
  if (err instanceof TuyaCloudStreamUnavailableError) return `${err.name}${err.cause instanceof Error ? ` (${tuyaCause(err.cause)})` : ""}`;
  if (err instanceof CameraUnavailableError) return `${err.name}: ${err.message}`; // fixed texts
  return err instanceof Error ? err.name : "unknown";
}

function tuyaCause(cause: Error): string {
  const code = (cause as { code?: unknown }).code;
  return typeof code === "number" ? `${cause.name} ${code}` : cause.name;
}
