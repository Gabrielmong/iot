import { canToggle } from '../../dashboard/lib/capabilities'
import { isDeviceOn } from '../../dashboard/lib/isDeviceOn'
import type { Device, StatePatch } from '../../dashboard/types'
import { LightControls } from './LightControls'
import { PowerSwitch } from './PowerSwitch'
import { UnavailableNotice } from './UnavailableNotice'

type Props = { device: Device; onPatch: (patch: StatePatch) => void }

const ignore = () => {}

/**
 * Every control the device supports: light controls for lights, on/off for switches and plugs.
 * While the device is offline or needs setup, the controls are disabled and nothing is sent.
 */
export function DeviceControls({ device, onPatch }: Props) {
  const available = canToggle(device)
  const send = available ? onPatch : ignore
  return (
    <>
      {!available && <UnavailableNotice device={device} />}
      {device.kind === 'LIGHT' ? (
        <LightControls device={device} disabled={!available} onChange={send} />
      ) : (
        <PowerSwitch on={isDeviceOn(device.state)} disabled={!available} onChange={(on) => send({ on })} />
      )}
    </>
  )
}
