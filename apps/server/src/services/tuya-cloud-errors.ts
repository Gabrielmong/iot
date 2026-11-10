import { TuyaCloudAuthError, TuyaCloudError, TuyaCloudExpiredError } from "@home/protocols";
import { coded } from "../api-errors.js";

/** Maps Tuya cloud failures to API errors with fixed messages (the cloud's own text is not passed on). */
export function tuyaCloudApiError(err: unknown): unknown {
  if (err instanceof TuyaCloudAuthError) return coded("TUYA_CLOUD_AUTH", "Tuya cloud rejected the Access ID or Secret");
  if (err instanceof TuyaCloudExpiredError) return coded("TUYA_CLOUD_EXPIRED", "The Tuya IoT Core subscription has expired");
  if (err instanceof TuyaCloudError) return coded("TUYA_CLOUD_ERROR", "The Tuya cloud request failed");
  return err;
}
