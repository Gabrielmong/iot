import PowerIcon from '@mui/icons-material/Power'
import Box from '@mui/material/Box'
import { motion } from 'framer-motion'
import { snappy } from '../../motion/tokens'

/** An on/off illustration for plugs and switches: the plug lights up green and lifts when on. */
export function PlugPreview({ on }: { on: boolean }) {
  return (
    <Box sx={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <Box
        component={motion.div}
        aria-hidden
        initial={false}
        animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }}
        transition={{ duration: 0.5 }}
        sx={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(47, 211, 138, 0.28), transparent 65%)',
        }}
      />
      <Box component={motion.div} initial={false} animate={{ scale: on ? 1 : 0.9, y: on ? -4 : 0 }} transition={snappy}>
        <PowerIcon
          role="img"
          aria-label="Power preview"
          aria-hidden={false}
          sx={{
            fontSize: 96,
            display: 'block',
            color: on ? 'success.main' : 'text.disabled',
            filter: on ? 'drop-shadow(0 0 18px rgba(47, 211, 138, 0.55))' : 'none',
            transition: 'color 250ms, filter 400ms',
          }}
        />
      </Box>
    </Box>
  )
}
