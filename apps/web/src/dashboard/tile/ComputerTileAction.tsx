import Typography from '@mui/material/Typography'

/** A computer tile's action: the whole tile is the "Wake" button; this says so, or "Waking…". */
export function ComputerTileAction({ waking }: { waking: boolean }) {
  return (
    <Typography variant="body2" sx={{ position: 'absolute', right: 16, bottom: 12, fontWeight: 600, color: waking ? 'text.secondary' : 'primary.main' }}>
      {waking ? 'Waking…' : 'Wake'}
    </Typography>
  )
}
