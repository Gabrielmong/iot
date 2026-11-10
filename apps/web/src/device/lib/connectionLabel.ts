/** How the device is reached: directly on the LAN, or through the Tuya cloud. */
export function connectionLabel(device: { connection: 'LOCAL' | 'CLOUD' }): 'Local (LAN)' | 'via Tuya cloud' {
  return device.connection === 'CLOUD' ? 'via Tuya cloud' : 'Local (LAN)'
}
