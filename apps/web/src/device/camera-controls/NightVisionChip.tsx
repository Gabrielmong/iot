import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import NightsStayIcon from '@mui/icons-material/NightsStay'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import type { NightVision } from '../../gql/graphql'
import { NIGHT_VISION_LABELS, NIGHT_VISION_ORDER } from './settingLabels'

type Props = { value: NightVision | null; disabled: boolean; onChange: (v: NightVision) => void }

/** Night vision (IR) mode: a chip that opens Auto / On / Off. */
export function NightVisionChip({ value, disabled, onChange }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const label = `Night vision: ${value ? NIGHT_VISION_LABELS[value] : '…'}`
  return (
    <>
      <Chip
        icon={<NightsStayIcon />}
        label={label}
        aria-label={label}
        aria-haspopup="menu"
        deleteIcon={<ArrowDropDownIcon />}
        onDelete={disabled ? undefined : (e) => setAnchor(e.currentTarget.parentElement)}
        variant="outlined"
        disabled={disabled || value === null}
        onClick={(e) => setAnchor(e.currentTarget)}
      />
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {NIGHT_VISION_ORDER.map((mode) => (
          <MenuItem
            key={mode}
            selected={mode === value}
            onClick={() => {
              setAnchor(null)
              if (mode !== value) onChange(mode)
            }}
          >
            {NIGHT_VISION_LABELS[mode]}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
