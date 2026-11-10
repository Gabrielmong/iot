import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import IconButton from '@mui/material/IconButton'

/** The "⋯" button that opens a device's details page (with its controls). */
export function TileMenuButton({ deviceName, onClick }: { deviceName: string; onClick: () => void }) {
  return (
    <IconButton
      aria-label={`More controls for ${deviceName}`}
      onClick={onClick}
      sx={{ position: 'absolute', top: 4, right: 4, width: 48, height: 48 }}
    >
      <MoreHorizIcon />
    </IconButton>
  )
}
