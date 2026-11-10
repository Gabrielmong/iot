import Chip from '@mui/material/Chip'

type Props = { label: string; on: boolean | null; disabled: boolean; onToggle: (next: boolean) => void }

/** An on/off setting as a chip: filled when on. */
export function ToggleChip({ label, on, disabled, onToggle }: Props) {
  return (
    <Chip
      label={label}
      aria-label={label}
      aria-pressed={on === true}
      color={on ? 'primary' : 'default'}
      variant={on ? 'filled' : 'outlined'}
      disabled={disabled || on === null}
      onClick={() => onToggle(!on)}
    />
  )
}
