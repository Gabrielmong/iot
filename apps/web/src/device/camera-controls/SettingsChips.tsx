import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { CameraSettingsInput } from '../../gql/graphql'
import type { CameraControls } from '../data/useCameraControls'
import { MoreSettingsMenu } from './MoreSettingsMenu'
import { NightVisionChip } from './NightVisionChip'
import { CHIP_SETTINGS, MORE_SETTINGS, SETTING_LABELS, type BoolSetting } from './settingLabels'
import { ToggleChip } from './ToggleChip'

type Props = { controls: CameraControls; onChange: (patch: CameraSettingsInput) => void }

/** The camera's settings under the video; only what it supports (the server leaves privacy out for non-admins). */
export function SettingsChips({ controls, onChange }: Props) {
  const supported = new Set(controls.supported)
  const values = controls.settings
  const unreadable = values === null || values === undefined
  const chips = CHIP_SETTINGS.filter((s) => supported.has(s))
  const more = MORE_SETTINGS.filter((s) => supported.has(s))
  const toggle = (s: BoolSetting, next: boolean) => onChange({ [s]: next })

  if (!supported.has('nightVision') && chips.length === 0 && more.length === 0) return null
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {supported.has('nightVision') && (
          <NightVisionChip value={values?.nightVision ?? null} disabled={unreadable} onChange={(nightVision) => onChange({ nightVision })} />
        )}
        {chips.map((s) => (
          <ToggleChip key={s} label={SETTING_LABELS[s]} on={values?.[s] ?? null} disabled={unreadable} onToggle={(next) => toggle(s, next)} />
        ))}
        {more.length > 0 && <MoreSettingsMenu settings={more} values={values ?? null} disabled={unreadable} onToggle={toggle} />}
      </Box>
      {unreadable && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Couldn&apos;t read the camera&apos;s settings
        </Typography>
      )}
    </Box>
  )
}
