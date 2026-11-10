import Box from '@mui/material/Box'
import type { ArrangedTile } from '../lib/reconcileLayout'
import { DeviceTile } from '../tile/DeviceTile'

const noop = () => {}

/** The card being dragged, lifted above the grid. A decorative copy of the tile. */
export function LiftedCard({ tile }: { tile: ArrangedTile }) {
  return (
    <Box
      inert
      aria-hidden
      sx={{
        height: '100%',
        transform: 'scale(1.03)',
        borderRadius: '10px',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.5), 0 0 0 2px var(--mui-palette-primary-main)',
        cursor: 'grabbing',
      }}
    >
      <DeviceTile device={tile.device} isAdmin={false} onToggle={noop} onOpenDetails={noop} />
    </Box>
  )
}
