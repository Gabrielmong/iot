import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'

/** The × on a widget card in arrange mode. */
export function RemoveWidgetButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <IconButton
      size="small"
      aria-label={`Remove ${name}`}
      onClick={onRemove}
      sx={{ position: 'absolute', top: 6, right: 6, zIndex: 1, bgcolor: 'rgba(12, 17, 32, 0.85)', '&:hover': { bgcolor: 'rgba(12, 17, 32, 0.95)' } }}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  )
}
