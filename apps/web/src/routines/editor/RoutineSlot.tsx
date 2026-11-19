import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

type Props = {
  label: string
  /** null: none picked. */
  id: string | null
  /** null with an id: that routine was removed. */
  name: string | null
  emptyText: string
  pickLabel: string
  onPick: () => void
  onClear?: () => void
}

/** "Then run: Cool down [Change]": the routine one branch of an If runs. */
export function RoutineSlot({ label, id, name, emptyText, pickLabel, onPick, onClear }: Props) {
  const removed = id !== null && name === null
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography sx={{ color: 'text.secondary', minWidth: 96 }}>{label}</Typography>
      <Typography sx={{ flex: 1, ...(removed && { color: 'warning.main' }), ...(id === null && { color: 'text.secondary' }) }}>
        {removed ? 'Removed routine' : (name ?? emptyText)}
      </Typography>
      <Button size="small" onClick={onPick} aria-label={pickLabel}>
        {id === null ? 'Pick' : 'Change'}
      </Button>
      {onClear && id !== null && (
        <Button size="small" color="inherit" onClick={onClear}>
          Clear
        </Button>
      )}
    </Box>
  )
}
