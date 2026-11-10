import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import { useState } from 'react'
import { SETTING_LABELS, type BoolSetting } from './settingLabels'

type Props = {
  settings: BoolSetting[]
  values: Partial<Record<BoolSetting, boolean | null>> | null
  disabled: boolean
  onToggle: (setting: BoolSetting, next: boolean) => void
}

/** "More…": the less-used on/off settings, as switches in a menu. */
export function MoreSettingsMenu({ settings, values, disabled, onToggle }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Chip label="More…" aria-label="More settings" aria-haspopup="menu" variant="outlined" disabled={disabled} onClick={(e) => setAnchor(e.currentTarget)} />
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {settings.map((s) => {
          const on = values?.[s] ?? null
          return (
            <MenuItem
              key={s}
              role="menuitemcheckbox"
              aria-checked={on === true}
              aria-label={SETTING_LABELS[s]}
              disabled={on === null}
              onClick={() => onToggle(s, !on)}
              sx={{ justifyContent: 'space-between', gap: 2 }}
            >
              {SETTING_LABELS[s]}
              <Switch size="small" checked={on === true} tabIndex={-1} slotProps={{ input: { 'aria-hidden': true } }} />
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}
