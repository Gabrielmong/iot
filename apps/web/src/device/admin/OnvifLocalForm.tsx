import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { SecretField } from '../../admin/common/SecretField'
import { useSubmit } from '../../admin/common/useSubmit'

type Props = {
  /** Where the login will be sent (the camera's current address): shown, confirmed by the admin, and sent back. */
  ip: string | null | undefined
  switchToLocal: (username: string, password: string, confirmAddress: string) => Promise<void>
}

/**
 * The camera's ONVIF login, sent only after the admin confirms the shown address (the server checks it
 * still matches). The password is write-only: empty on load and cleared after success.
 */
export function OnvifLocalForm({ ip, switchToLocal }: Props) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const run = useCallback(() => switchToLocal(username.trim(), password, ip ?? ''), [switchToLocal, username, password, ip])
  const done = useCallback(() => setPassword(''), [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={2}>
      <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" fullWidth />
      <SecretField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="body2" color="text.secondary">
        Camera address: {ip ?? 'unknown'}
      </Typography>
      <FormControlLabel
        control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} required />}
        label="This is the camera's address"
      />
      <Button
        variant="contained"
        size="large"
        disabled={pending || !ip || !confirmed || username.trim() === '' || password === ''}
        onClick={() => void submit()}
      >
        Test &amp; switch to local
      </Button>
    </Stack>
  )
}
