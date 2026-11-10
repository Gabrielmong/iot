import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { SWATCHES } from '../../dashboard/lib/swatches'
import type { Rgb } from '../../dashboard/types'

/** The 8 preset colors as large round buttons. */
export function ColorSwatches({ disabled = false, onPick }: { disabled?: boolean; onPick: (color: Rgb) => void }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
      {SWATCHES.map(({ name, rgb }) => (
        <ButtonBase
          key={name}
          aria-label={`Color ${name}`}
          disabled={disabled}
          onClick={() => onPick(rgb)}
          sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, border: 1, borderColor: 'divider', '&.Mui-disabled': { opacity: 0.4 } }}
        />
      ))}
    </Box>
  )
}
