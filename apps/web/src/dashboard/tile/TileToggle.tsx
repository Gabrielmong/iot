import Box from '@mui/material/Box'
import { motion } from 'framer-motion'
import { snappy } from '../../motion/tokens'
import type { TileOnStyle } from '../lib/tileOnStyle'

/** Phone-style switch that mirrors the tile's state. Presentational only: the tile is the tap target. */
export function TileToggle({ state }: { state: TileOnStyle }) {
  const on = state === 'on'
  return (
    <Box
      data-testid="tile-toggle"
      data-state={state}
      aria-hidden
      sx={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 46,
        height: 26,
        borderRadius: 13,
        bgcolor: on ? 'success.main' : 'action.disabledBackground',
        transition: 'background-color 220ms',
        pointerEvents: 'none',
        p: '3px',
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        component={motion.span}
        layout
        transition={snappy}
        sx={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          bgcolor: on ? 'common.white' : 'text.disabled',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </Box>
  )
}
