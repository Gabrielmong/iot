import SettingsIcon from '@mui/icons-material/Settings'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import { useState } from 'react'
import { isSharedScreen, setSharedScreen } from './session'

/** Settings icon that reveals the per-browser "This is a shared screen" option. */
export function SharedScreenToggle() {
  const [open, setOpen] = useState(false)
  const [shared, setShared] = useState(isSharedScreen)

  return (
    <>
      <IconButton aria-label="Settings" onClick={() => setOpen((o) => !o)} sx={{ width: 56, height: 56 }}>
        <SettingsIcon />
      </IconButton>
      {open && (
        <FormControlLabel
          label="This is a shared screen"
          control={
            <Checkbox
              checked={shared}
              onChange={(e) => {
                setShared(e.target.checked)
                setSharedScreen(e.target.checked)
              }}
            />
          }
        />
      )}
    </>
  )
}
