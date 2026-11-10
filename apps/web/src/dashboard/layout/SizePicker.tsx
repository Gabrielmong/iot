import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { TILE_SIZE_LABEL, TILE_SIZES, type TileSize } from '../lib/tileSize'

type Props = { deviceName: string; value: TileSize; onChange: (size: TileSize) => void }

/** Four small buttons choosing a card's size; the current one is highlighted. */
export function SizePicker({ deviceName, value, onChange }: Props) {
  return (
    <Box
      role="radiogroup"
      aria-label={`Card size for ${deviceName}`}
      sx={{ display: 'flex', gap: 0.5, p: 0.5, borderRadius: '8px', bgcolor: 'rgba(12, 17, 32, 0.85)', backdropFilter: 'blur(6px)' }}
    >
      {TILE_SIZES.map((size) => {
        const selected = size === value
        return (
          <ButtonBase
            key={size}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(size)}
            sx={{
              px: 0.75,
              minWidth: 34,
              height: 26,
              borderRadius: '6px',
              fontSize: 12,
              fontWeight: 700,
              color: selected ? 'primary.contrastText' : 'text.secondary',
              bgcolor: selected ? 'primary.main' : 'transparent',
              transition: 'background-color 150ms, color 150ms',
              '&:hover': selected ? undefined : { bgcolor: 'action.hover' },
              '&.Mui-focusVisible': { outline: '2px solid var(--mui-palette-primary-main)' },
            }}
          >
            {TILE_SIZE_LABEL[size]}
          </ButtonBase>
        )
      })}
    </Box>
  )
}
