import TextField from '@mui/material/TextField'
import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<typeof TextField>, 'type' | 'variant' | 'autoComplete'>

/**
 * A write-only input for PINs, keys and passwords: masked, never prefilled by callers
 * (pass `value=""` initially) and kept out of browser autofill.
 */
export function SecretField(props: Props) {
  return <TextField {...props} type="password" autoComplete="new-password" fullWidth />
}
