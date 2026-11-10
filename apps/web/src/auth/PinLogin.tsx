import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { PinDisplay } from './PinDisplay'
import { PinPad } from './PinPad'
import { Shake } from './Shake'
import type { PickerUser } from './UserPicker'
import { usePinEntry } from './usePinEntry'
import { useLogin } from './useLogin'
import { UserAvatar } from '../avatars/UserAvatar'

export interface PinLoginProps {
  user: PickerUser
  onSuccess: () => void
  onBack: () => void
}

/** PIN step of the login: wires the pad to the entry state and the login mutation. The dots shake on a wrong PIN. */
export function PinLogin({ user, onSuccess, onBack }: PinLoginProps) {
  const entry = usePinEntry()
  const { login, error, loading } = useLogin()
  const [failures, setFailures] = useState(0)

  const submit = async () => {
    if (await login(user.id, entry.pin)) return onSuccess()
    entry.clear()
    setFailures((n) => n + 1)
  }

  return (
    <Stack spacing={3} sx={{ alignItems: 'center' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <UserAvatar name={user.name} color={user.avatarColor} image={user.avatarImage} />
        <Typography variant="h5">{user.name}</Typography>
      </Stack>
      <Shake trigger={failures}>
        <PinDisplay length={entry.pin.length} />
      </Shake>
      {error && <Alert severity="error">{error}</Alert>}
      <PinPad
        onDigit={entry.pushDigit}
        onBackspace={entry.backspace}
        onSubmit={submit}
        canSubmit={entry.canSubmit}
        disabled={loading}
      />
      <Button onClick={onBack} color="inherit" sx={{ color: 'text.secondary' }}>
        Not {user.name}?
      </Button>
    </Stack>
  )
}
