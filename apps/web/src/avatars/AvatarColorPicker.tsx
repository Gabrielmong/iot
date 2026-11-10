import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { AVATAR_COLORS } from './avatarColors'
import { PickerLabel } from './PickerLabel'

type Props = { value: string; onChange: (color: string) => void }

/** The fixed palette of avatar colors as a radio group of swatches, all on one row sized to the dialog. */
export function AvatarColorPicker({ value, onChange }: Props) {
  return (
    <Box>
      <PickerLabel>Color</PickerLabel>
      <Box role="radiogroup" aria-label="Avatar color" sx={{ display: 'grid', gridTemplateColumns: `repeat(${AVATAR_COLORS.length}, 1fr)`, gap: 1 }}>
        {AVATAR_COLORS.map((color) => (
          <ButtonBase
            key={color}
            role="radio"
            aria-checked={color === value}
            aria-label={color}
            onClick={() => onChange(color)}
            sx={{ width: '100%', maxWidth: 44, aspectRatio: '1', justifySelf: 'center', borderRadius: '50%', bgcolor: color, color: '#fff' }}
          >
            {color === value && <CheckIcon />}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  )
}
