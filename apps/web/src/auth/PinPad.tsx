import BackspaceIcon from '@mui/icons-material/Backspace'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const KEY_SX = { height: 72, fontSize: 28 } as const

export interface PinPadProps {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onSubmit: () => void
  canSubmit: boolean
  disabled?: boolean
}

/** Presentational numeric keypad with big touch targets. */
export function PinPad({ onDigit, onBackspace, onSubmit, canSubmit, disabled = false }: PinPadProps) {
  const digit = (d: string) => (
    <Grid key={d} size={4}>
      <Button fullWidth variant="outlined" sx={KEY_SX} disabled={disabled} onClick={() => onDigit(d)}>
        {d}
      </Button>
    </Grid>
  )
  return (
    <Grid container spacing={1.5} sx={{ width: 300 }}>
      {KEYS.map(digit)}
      <Grid size={4}>
        <IconButton
          aria-label="Backspace"
          sx={{ ...KEY_SX, width: '100%', borderRadius: 1 }}
          disabled={disabled}
          onClick={onBackspace}
        >
          <BackspaceIcon />
        </IconButton>
      </Grid>
      {digit('0')}
      <Grid size={4}>
        <Button fullWidth variant="contained" sx={KEY_SX} disabled={disabled || !canSubmit} onClick={onSubmit}>
          OK
        </Button>
      </Grid>
    </Grid>
  )
}
