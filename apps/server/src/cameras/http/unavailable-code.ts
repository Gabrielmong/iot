import { TuyaCloudStreamUnavailableError } from "@home/protocols";

/** The `{code}` of a 503 for a failed camera request: the Tuya cloud refusing the stream is told apart, nothing else is. */
export function unavailableCode(err: unknown): "CLOUD_STREAM_UNAVAILABLE" | "CAMERA_UNAVAILABLE" {
  return err instanceof TuyaCloudStreamUnavailableError ? "CLOUD_STREAM_UNAVAILABLE" : "CAMERA_UNAVAILABLE";
}
