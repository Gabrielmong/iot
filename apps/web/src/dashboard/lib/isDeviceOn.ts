/** Whether the device is on. The server leaves `state.on` null for lights and reports `light.on`. */
export function isDeviceOn(state: { on?: boolean | null; light?: { on?: boolean } | null }): boolean {
  return state.on ?? state.light?.on ?? false
}
