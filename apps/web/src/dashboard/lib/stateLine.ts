import type { Device, LightState } from '../types'
import { isCamera, isComputer, isSupportedKind, needsSetup } from './capabilities'
import { colorName, whiteTempName } from './colorName'
import { isDeviceOn } from './isDeviceOn'

function lightName(light: LightState): string | null {
  if (light.mode === 'white' && light.colorTempK != null) return whiteTempName(light.colorTempK)
  return light.color ? colorName(light.color) : null
}

/** The tile's one-line state: "Purple · 70%", "Warm · 40%", "On", "Off", "Offline", "Online" (cameras), ... */
export function stateLine(d: Device): string {
  if (needsSetup(d)) return 'Needs setup'
  if (!isSupportedKind(d)) return 'Not supported yet'
  if (!d.state.online) return 'Offline'
  if (isCamera(d)) return 'Online'
  // A PC without an IP, or one whose probe never got an answer (firewalled), can't be told apart from Off.
  if (isComputer(d) && d.state.on == null) return 'Status unknown'
  if (!isDeviceOn(d.state)) return 'Off'
  const light = d.state.light
  if (light) {
    const name = lightName(light)
    return name ? `${name} · ${light.brightness}%` : `${light.brightness}%`
  }
  return 'On'
}
