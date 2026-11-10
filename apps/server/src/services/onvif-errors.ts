import { OnvifAuthError, OnvifNoStreamError } from "@home/protocols";
import { coded } from "../api-errors.js";

/** The API errors of ONVIF setup. Messages are fixed text: never a password, URI or camera reply. */
export const onvifAuthFailed = () => coded("ONVIF_AUTH_FAILED", "The camera rejected that username or password");
export const onvifUnreachable = () => coded("ONVIF_UNREACHABLE", "The camera did not answer over ONVIF or RTSP");
export const onvifCameraNotConfirmed = () =>
  coded("ONVIF_CAMERA_NOT_CONFIRMED", "Couldn't confirm the camera at its address. Wait until the camera shows online, then try again.");
export const onvifNoStream = () => coded("ONVIF_NO_STREAM", "The camera answered but offered no usable local stream");

/** Maps a probe failure to its API error: OnvifUnreachableError, and anything unexpected, is ONVIF_UNREACHABLE. */
export function onvifProbeError(e: unknown): Error {
  if (e instanceof OnvifAuthError) return onvifAuthFailed();
  if (e instanceof OnvifNoStreamError) return onvifNoStream();
  return onvifUnreachable();
}
