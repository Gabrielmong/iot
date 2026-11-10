/** Friendly text for the ONVIF local-stream errors (merged into adminErrorMessage). */
export const ONVIF_ERROR_COPY: Record<string, string> = {
  ONVIF_AUTH_FAILED: "The camera rejected that username or password. Use the ONVIF password set in the camera's app.",
  ONVIF_UNREACHABLE: "The camera didn't answer over ONVIF. Check that it is on, on this network, and has ONVIF turned on.",
  ONVIF_NO_STREAM: 'The camera answered, but no usable local stream was found.',
  ONVIF_CAMERA_NOT_CONFIRMED: "Couldn't confirm the camera at its address. Wait until the camera shows online, then try again.",
}
