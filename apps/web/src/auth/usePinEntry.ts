import { useCallback, useState } from 'react'

export const MIN_PIN_LENGTH = 4
export const MAX_PIN_LENGTH = 8

export interface PinEntry {
  pin: string
  canSubmit: boolean
  pushDigit: (digit: string) => void
  backspace: () => void
  clear: () => void
}

/** Digits typed so far on the PIN pad. */
export function usePinEntry(): PinEntry {
  const [pin, setPin] = useState('')
  const pushDigit = useCallback(
    (digit: string) => setPin((p) => (p.length < MAX_PIN_LENGTH ? p + digit : p)),
    [],
  )
  const backspace = useCallback(() => setPin((p) => p.slice(0, -1)), [])
  const clear = useCallback(() => setPin(''), [])
  return { pin, canSubmit: pin.length >= MIN_PIN_LENGTH, pushDigit, backspace, clear }
}
