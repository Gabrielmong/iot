import type { Device } from '../types'

const NOT_READY = new Set<Device['status']>(['KEY_INVALID', 'NEEDS_KEY', 'NEEDS_CREDENTIALS', 'NEEDS_PAIRING'])
const SWITCHABLE = new Set<Device['kind']>(['LIGHT', 'SWITCH', 'PLUG'])
const FULL_LIGHT_BRANDS = new Set<Device['brand']>(['GOVEE', 'TUYA'])

export type LightCapabilities = { brightness: boolean; color: boolean; whiteTemp: boolean }

/** The device has a status the admin must fix (missing or bad key/credentials, or a TV to pair). */
export const needsSetup = (d: Device) => NOT_READY.has(d.status)

/** LIGHT, SWITCH and PLUG switch on and off. */
export const isSwitchable = (d: Device) => SWITCHABLE.has(d.kind)

export const isCamera = (d: Device) => d.kind === 'CAMERA'

export const isTv = (d: Device) => d.kind === 'TV'

export const isComputer = (d: Device) => d.kind === 'COMPUTER'

/** Switchable kinds, cameras, TVs and computers are supported; UNKNOWN is not. */
export const isSupportedKind = (d: Device) => isSwitchable(d) || isCamera(d) || isTv(d) || isComputer(d)

/** Cameras have nothing to toggle: a tap opens their details page instead. */
export const opensDetailsOnTap = isCamera

/** Whether a tap may toggle (or, for a computer, wake) the device right now. */
export const canToggle = (d: Device) => (isSwitchable(d) || isTv(d) || isComputer(d)) && !needsSetup(d) && d.state.online

/** Which light controls beyond on/off the device supports. */
export function lightCapabilities(d: Device): LightCapabilities {
  const full = d.kind === 'LIGHT' && FULL_LIGHT_BRANDS.has(d.brand)
  return { brightness: full, color: full, whiteTemp: full }
}
