import type { Device, LightState, StatePatch } from '../types'

function patchLight(light: LightState, patch: StatePatch): LightState {
  const next = { ...light }
  if (patch.on != null) next.on = patch.on
  if (patch.brightness != null) next.brightness = patch.brightness
  if (patch.color) {
    next.mode = 'color'
    // __typename keeps the optimistic object shaped like a server result for the cache.
    next.color = { __typename: 'Rgb', ...patch.color } as LightState['color']
  } else if (patch.colorTempK != null) {
    next.mode = 'white'
    next.colorTempK = patch.colorTempK
  }
  return next
}

/**
 * The device as it will be once `patch` succeeds (used as the optimistic response). Keeps the
 * server's shape: `on` goes to `light.on` for lights, and to `state.on` only where that is reported.
 */
export function applyPatch(device: Device, patch: StatePatch): Device {
  const light = device.state.light && patchLight(device.state.light, patch)
  const reportsOn = device.state.on != null || !light
  const on = reportsOn ? (patch.on ?? device.state.on) : device.state.on
  return { ...device, state: { ...device.state, on, light } }
}
