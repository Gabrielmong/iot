import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { motion } from 'framer-motion'
import { snappy } from '../motion/tokens'
import { MIN_PIN_LENGTH } from './usePinEntry'

/** Row of dots: filled (with a pop) for typed digits, outlined placeholders up to the minimum length. */
export function PinDisplay({ length }: { length: number }) {
  const slots = Math.max(length, MIN_PIN_LENGTH)
  return (
    <Stack direction="row" spacing={1.75} sx={{ justifyContent: 'center', height: 20, alignItems: 'center' }} aria-label={`${length} digits entered`}>
      {Array.from({ length: slots }, (_, i) => {
        const filled = i < length
        return (
          <Box
            key={i}
            component={motion.span}
            initial={false}
            animate={{ scale: filled ? [1.45, 1] : 1 }}
            transition={snappy}
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: 2,
              borderColor: filled ? 'primary.main' : 'text.disabled',
              bgcolor: filled ? 'primary.main' : 'transparent',
              boxShadow: filled ? '0 0 10px var(--mui-palette-primary-main)' : 'none',
              transition: 'background-color 120ms, border-color 120ms',
            }}
          />
        )
      })}
    </Stack>
  )
}
