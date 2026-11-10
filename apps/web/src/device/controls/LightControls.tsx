import Stack from '@mui/material/Stack'
import { lightCapabilities } from '../../dashboard/lib/capabilities'
import { isDeviceOn } from '../../dashboard/lib/isDeviceOn'
import { DEFAULT_KELVIN } from '../../dashboard/lib/kelvinToRgb'
import type { Device, StatePatch } from '../../dashboard/types'
import { BrightnessSlider } from './BrightnessSlider'
import { ColorSwatches } from './ColorSwatches'
import { HueSlider } from './HueSlider'
import { PowerSwitch } from './PowerSwitch'
import { WhiteTempSlider } from './WhiteTempSlider'

type Props = { device: Device; disabled: boolean; onChange: (patch: StatePatch) => void }

/** Power plus whichever of brightness, color and white temperature the light supports. */
export function LightControls({ device, disabled, onChange }: Props) {
  const light = device.state.light
  const caps = lightCapabilities(device)
  return (
    <Stack spacing={3}>
      <PowerSwitch on={isDeviceOn(device.state)} disabled={disabled} onChange={(on) => onChange({ on })} />
      {light && caps.brightness && (
        <BrightnessSlider value={light.brightness} disabled={disabled} onCommit={(brightness) => onChange({ brightness })} />
      )}
      {light && caps.color && (
        <>
          <ColorSwatches disabled={disabled} onPick={(color) => onChange({ color })} />
          <HueSlider color={light.color} disabled={disabled} onCommit={(color) => onChange({ color })} />
        </>
      )}
      {light && caps.whiteTemp && (
        <WhiteTempSlider
          value={light.colorTempK ?? DEFAULT_KELVIN}
          disabled={disabled}
          onCommit={(colorTempK) => onChange({ colorTempK })}
        />
      )}
    </Stack>
  )
}
