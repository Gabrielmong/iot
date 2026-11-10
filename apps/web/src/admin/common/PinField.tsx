import { isValidPin, PIN_HINT } from '../lib/pin'
import { SecretField } from './SecretField'

type Props = { value: string; onChange: (pin: string) => void; label?: string; helperText?: string }

/** Masked PIN input that flags malformed values (4 to 8 digits) as soon as something is typed. */
export function PinField({ value, onChange, label = 'PIN', helperText }: Props) {
  const invalid = value !== '' && !isValidPin(value)
  return (
    <SecretField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={invalid}
      helperText={invalid ? `PIN must be ${PIN_HINT}` : helperText}
      slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }}
    />
  )
}
