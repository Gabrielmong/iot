import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useCallback, useState } from 'react'
import { SecretField } from '../common/SecretField'
import { useSubmit } from '../common/useSubmit'
import { useSetSwannRecorder } from '../data/useSetSwannRecorder'
import { SWANN_DEFAULT_HOST, SWANN_H265_NOTE, swannFoundText, usesH265, type SwannFound } from '../lib/swannFound'

/** Swann recorder login. The password is write-only: empty on load and cleared after a successful probe. */
export function SwannRecorderForm({ configured }: { configured: boolean | undefined }) {
  const save = useSetSwannRecorder()
  const [host, setHost] = useState(configured === false ? SWANN_DEFAULT_HOST : '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [found, setFound] = useState<SwannFound | null>(null)
  const run = useCallback(async () => setFound(await save(host.trim(), username.trim(), password)), [save, host, username, password])
  const done = useCallback(() => setPassword(''), [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={2}>
      <TextField label="Recorder IP" value={host} onChange={(e) => setHost(e.target.value)} autoComplete="off" fullWidth />
      <TextField label="Recorder username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" fullWidth />
      <SecretField label="Recorder password" value={password} onChange={(e) => { setPassword(e.target.value); setFound(null) }} />
      {error && <Alert severity="error">{error}</Alert>}
      {found && !error && <Alert severity="success">{swannFoundText(found)}</Alert>}
      {found && !error && usesH265(found) && <Alert severity="info">{SWANN_H265_NOTE}</Alert>}
      <Button
        variant="contained"
        size="large"
        disabled={pending || host.trim() === '' || username.trim() === '' || password === ''}
        onClick={() => void submit()}
      >
        Test &amp; find cameras
      </Button>
    </Stack>
  )
}
