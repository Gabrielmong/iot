import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

type Props = { on: boolean; canPowerOn: boolean; onChange: (on: boolean) => void }

/** Turns the TV on or off; an off TV that can't be woken says so instead. */
export function PowerButton({ on, canPowerOn, onChange }: Props) {
  const disabled = !on && !canPowerOn
  return (
    <Stack spacing={0.5}>
      <Button
        variant={on ? 'contained' : 'outlined'}
        color={on ? 'success' : 'inherit'}
        aria-label="Power"
        aria-pressed={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        startIcon={<PowerSettingsNewIcon />}
        sx={{ minHeight: 56, borderRadius: '14px' }}
      >
        {on ? 'On' : 'Off'}
      </Button>
      {disabled && (
        <Typography variant="caption" color="text.secondary">
          This TV can only be turned off from the app
        </Typography>
      )}
    </Stack>
  )
}
