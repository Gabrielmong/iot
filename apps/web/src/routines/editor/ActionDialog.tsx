import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { lightCapabilities } from '../../dashboard/lib/capabilities'
import { DEFAULT_KELVIN } from '../../dashboard/lib/kelvinToRgb'
import type { Device } from '../../dashboard/types'
import { BrightnessSlider } from '../../device/controls/BrightnessSlider'
import { ColorSwatches } from '../../device/controls/ColorSwatches'
import { HueSlider } from '../../device/controls/HueSlider'
import { WhiteTempSlider } from '../../device/controls/WhiteTempSlider'
import { describeAction } from '../lib/describeAction'
import type { DraftAction } from '../lib/draft'
import { PowerChoice } from './PowerChoice'

type Props = { device: Device; action: DraftAction; onSave: (action: DraftAction) => void; onClose: () => void }

const DEFAULT_BRIGHTNESS = 100

/**
 * What a step sets one device to. Power is On / Off / Leave as is (lights only); lights that support
 * it also get brightness and either a color or a white temperature. Untouched settings stay as they are.
 */
export function ActionDialog({ device, action, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(action)
  const titleId = useId()
  const caps = lightCapabilities(device)
  const details = draft.on !== false
  const set = (patch: Partial<DraftAction>) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{device.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <PowerChoice value={draft.on} allowLeave={caps.brightness} wakeOnly={device.kind === 'COMPUTER'} onChange={(on) => set({ on })} />
          {details && caps.brightness && (
            <ClearableSetting set={draft.brightness !== null} onClear={() => set({ brightness: null })}>
              <BrightnessSlider value={draft.brightness ?? DEFAULT_BRIGHTNESS} onCommit={(brightness) => set({ brightness })} />
            </ClearableSetting>
          )}
          {details && caps.color && (
            <ClearableSetting set={draft.color !== null} onClear={() => set({ color: null })}>
              <ColorSwatches onPick={(color) => set({ color, colorTempK: null })} />
              <HueSlider color={draft.color} onCommit={(color) => set({ color, colorTempK: null })} />
            </ClearableSetting>
          )}
          {details && caps.whiteTemp && (
            <ClearableSetting set={draft.colorTempK !== null} onClear={() => set({ colorTempK: null })}>
              <WhiteTempSlider value={draft.colorTempK ?? DEFAULT_KELVIN} onCommit={(colorTempK) => set({ colorTempK, color: null })} />
            </ClearableSetting>
          )}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {describeAction(draft)}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(draft)}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** A setting with a "Leave as is" link once it has been set. */
function ClearableSetting({ set, onClear, children }: { set: boolean; onClear: () => void; children: React.ReactNode }) {
  return (
    <Stack spacing={1}>
      {children}
      {set && (
        <Button size="small" onClick={onClear} sx={{ alignSelf: 'flex-start' }}>
          Don’t change this
        </Button>
      )}
    </Stack>
  )
}
