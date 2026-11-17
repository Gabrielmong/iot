import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

type Props = { name: string | null; onChange: () => void }

/** A step that runs another routine. `name` is null when that routine was removed. */
export function RoutineStepCard({ name, onChange }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ flex: 1, ...(name === null && { color: 'warning.main' }) }}>{name ?? 'Removed routine'}</Typography>
      <Button size="small" onClick={onChange}>
        Change
      </Button>
    </Box>
  )
}
