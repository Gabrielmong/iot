import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useDeviceTrial } from '../data/useDeviceTrial'
import type { AdminDevice } from '../types'

/**
 * Lets the admin switch a new device on and off to find out which one it is. "Test" connects to it
 * and shows its real state; devices that can't be tested show a disabled button with the reason.
 */
export function TestControl({ device }: { device: AdminDevice }) {
  const trial = useDeviceTrial(device.id)
  const note = device.testable ? trial.error : device.testBlockedReason

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {trial.phase === 'ready' ? (
        <Switch
          checked={trial.on ?? false}
          onChange={(e) => trial.set(e.target.checked)}
          color="success"
          slotProps={{ input: { role: 'switch', 'aria-label': `Test ${device.name}` } }}
        />
      ) : (
        <Button
          variant="outlined"
          size="small"
          disabled={!device.testable || trial.phase === 'starting'}
          onClick={trial.start}
          startIcon={trial.phase === 'starting' ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          Test
        </Button>
      )}
      {note && (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {note}
        </Typography>
      )}
    </Box>
  )
}
