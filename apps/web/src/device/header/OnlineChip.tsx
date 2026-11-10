import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import { motion } from 'framer-motion'

/** A breathing green dot while the device is reachable. Decorative: the chip's label says it. */
function LiveDot() {
  return (
    <Box
      component={motion.span}
      aria-hidden
      animate={{ opacity: [1, 0.35, 1] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', ml: 1, boxShadow: '0 0 8px var(--mui-palette-success-main)' }}
    />
  )
}

/** "Online" with a live dot, or a plain "Offline". */
export function OnlineChip({ online }: { online: boolean }) {
  if (!online) return <Chip size="small" label="Offline" />
  return (
    <Chip
      size="small"
      icon={<LiveDot />}
      label="Online"
      sx={{ bgcolor: 'rgba(47, 211, 138, 0.14)', color: 'success.main', border: '1px solid rgba(47, 211, 138, 0.35)' }}
    />
  )
}
