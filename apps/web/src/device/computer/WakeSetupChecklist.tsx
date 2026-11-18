import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { WAKE_SETUP_STEPS } from './wakeSetupSteps'

/** Controlled when `open`/`onToggle` are given (so a parent can open it), otherwise it keeps its own state. */
type Props = { open?: boolean; onToggle?: () => void }

/** "How to set up Wake-on-LAN", expanding into the PC setup checklist. */
export function WakeSetupChecklist(props: Props) {
  const [own, setOwn] = useState(false)
  const open = props.open ?? own
  const onToggle = props.onToggle ?? (() => setOwn((o) => !o))
  return (
    <>
      <Button size="small" onClick={onToggle} aria-expanded={open} sx={{ alignSelf: 'flex-start' }}>
        How to set up Wake-on-LAN
      </Button>
      <Collapse in={open}>
        <Typography component="ol" variant="body2" color="text.secondary" sx={{ pl: 2.5, m: 0 }}>
          {WAKE_SETUP_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </Typography>
      </Collapse>
    </>
  )
}
