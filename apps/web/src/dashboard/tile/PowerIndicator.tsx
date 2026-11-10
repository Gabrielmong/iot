import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import Box from '@mui/material/Box'
import { motion } from 'framer-motion'
import { snappy } from '../../motion/tokens'
import type { TileOnStyle } from '../lib/tileOnStyle'

/** Round power badge: filled green with a glow when on, grey when off; pops when it turns on. Decorative. */
export function PowerIndicator({ state }: { state: TileOnStyle }) {
  const on = state === 'on'
  return (
    <Box
      component={motion.div}
      data-testid="power-indicator"
      data-state={state}
      aria-hidden
      initial={false}
      animate={{ scale: on ? [0.8, 1.12, 1] : 1 }}
      transition={snappy}
      sx={{
        position: 'absolute',
        top: 12,
        right: 56,
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: on ? 'success.main' : 'action.disabledBackground',
        color: on ? 'success.contrastText' : 'text.disabled',
        boxShadow: on ? '0 0 14px var(--mui-palette-success-main)' : 'none',
        transition: 'background-color 220ms, box-shadow 320ms, color 220ms',
        pointerEvents: 'none',
      }}
    >
      <PowerSettingsNewIcon fontSize="small" />
    </Box>
  )
}
