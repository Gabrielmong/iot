import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type FormEvent, useId, useState } from 'react'
import type { AdminDevice } from '../../types'
import { PairingCodeField } from './PairingCodeField'
import { type PairStep, usePairTv } from './usePairTv'

type Props = { device: Pick<AdminDevice, 'id' | 'name'>; onClose: () => void }

/** Pairs a TV: start → type the code (or accept on the TV) → done or error. Closing early cancels. */
export function PairTvDialog({ device, onClose }: Props) {
  const titleId = useId()
  const { step, submitCode, cancel } = usePairTv(device.id)
  const [code, setCode] = useState('')
  const close = () => {
    cancel()
    onClose()
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (step.kind === 'code' && !step.busy && code.trim() !== '') submitCode(code.trim())
  }
  return (
    <Dialog open onClose={close} aria-labelledby={titleId} fullWidth maxWidth="xs" slotProps={{ paper: { component: 'form', onSubmit } }}>
      <DialogTitle id={titleId}>Pair {device.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <StepBody step={step} name={device.name} code={code} onCode={setCode} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {step.kind === 'done' ? (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            {step.kind === 'code' && (
              <Button type="submit" variant="contained" disabled={step.busy || code.trim() === ''}>
                Pair
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

function StepBody({ step, name, code, onCode }: { step: PairStep; name: string; code: string; onCode: (c: string) => void }) {
  switch (step.kind) {
    case 'starting':
      return <Waiting text={`Contacting ${name}…`} />
    case 'code':
      return <PairingCodeField value={code} error={step.error} onChange={onCode} />
    case 'accept':
      return <Waiting text="Accept the request on the TV" />
    case 'done':
      return <Alert severity="success">{name} is paired.</Alert>
    case 'failed':
      return <Alert severity="error">{step.error}</Alert>
  }
}

function Waiting({ text }: { text: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <CircularProgress size={24} />
      <Typography>{text}</Typography>
    </Stack>
  )
}
