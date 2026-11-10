import Box from '@mui/material/Box'
import { motion } from 'framer-motion'
import { settle } from '../../motion/tokens'
import { previewColor, type PreviewState } from '../lib/previewColor'

/** A drawing of the light (bulb on a base) glowing in its current colour and brightness. */
export function LightPreview({ state }: { state: PreviewState }) {
  const { css, glow } = previewColor(state)
  return (
    <Box sx={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <Box
        aria-hidden
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${css} 45%, transparent), transparent 65%)`, opacity: glow }}
        sx={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', transition: 'opacity 400ms, background 300ms' }}
      />
      <Box component={motion.div} initial={false} animate={{ scale: glow > 0 ? 1 : 0.92 }} transition={settle} sx={{ position: 'relative' }}>
        <Box
          role="img"
          aria-label="Light preview"
          // Inline style: these values change on every brightness/colour step.
          style={{ backgroundColor: css, boxShadow: glow > 0 ? `0 0 ${50 * glow}px ${18 * glow}px ${css}` : 'none' }}
          sx={{ width: 86, height: 86, borderRadius: '50%', transition: 'background-color 250ms, box-shadow 250ms' }}
        />
      </Box>
      <Box aria-hidden sx={{ position: 'absolute', bottom: 28, width: 34, height: 22, bgcolor: '#4a5168', borderRadius: '3px 3px 8px 8px' }} />
    </Box>
  )
}
