import Typography from '@mui/material/Typography'
import { CameraPlayer } from '../camera/CameraPlayer'
import { useCameraControls } from '../data/useCameraControls'
import { ControlOverlay } from './ControlOverlay'
import { PrivacyFrame } from './PrivacyFrame'
import { SettingsChips } from './SettingsChips'

type Props = { deviceId: string; brand?: string; cloud: boolean }

/** The live player, with move/preset controls over it and settings below for cameras that have them (Tuya only). */
export function ControlledCamera({ deviceId, brand, cloud }: Props) {
  if (brand !== 'TUYA') return <CameraPlayer deviceId={deviceId} cloud={cloud} />
  return <TuyaCamera deviceId={deviceId} cloud={cloud} />
}

function TuyaCamera({ deviceId, cloud }: { deviceId: string; cloud: boolean }) {
  const { controls, error, move, stop, gotoPreset, savePreset, setSettings } = useCameraControls(deviceId)
  const privacy = controls?.settings?.privacy === true
  const overlay = controls && (controls.pan || controls.presets) ? <ControlOverlay controls={controls} actions={{ move, stop, gotoPreset, savePreset }} /> : null

  return (
    <>
      {privacy ? <PrivacyFrame /> : <CameraPlayer deviceId={deviceId} cloud={cloud} overlay={overlay} />}
      {error && (
        <Typography variant="body2" color="error" role="status" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      {controls && <SettingsChips controls={controls} onChange={setSettings} />}
    </>
  )
}
