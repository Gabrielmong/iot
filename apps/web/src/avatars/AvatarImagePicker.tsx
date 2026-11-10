import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { AVATAR_IMAGES } from './avatarImages'
import { UserAvatar } from './UserAvatar'
import { PickerLabel } from './PickerLabel'

type Props = { name: string; color: string; value: string; onChange: (image: string) => void }

/** "Initial" (no picture, value "") or one of the built-in pictures: a 3-column grid of large previews in the chosen color. */
export function AvatarImagePicker({ name, color, value, onChange }: Props) {
  const options = [{ id: '', label: 'Initial only' }, ...AVATAR_IMAGES]
  return (
    <Box>
      <PickerLabel>Picture</PickerLabel>
      <Box role="radiogroup" aria-label="Profile picture" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 2, rowGap: 3, justifyItems: 'center', px: 1 }}>
        {options.map((o) => {
          const selected = o.id === value
          return (
            <ButtonBase
              key={o.id || 'none'}
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              onClick={() => onChange(o.id)}
              sx={{
                position: 'relative',
                width: '100%',
                maxWidth: 104,
                borderRadius: '50%',
                opacity: selected ? 1 : 0.75,
                transition: 'opacity 160ms, transform 160ms',
                '&:hover': { opacity: 1, transform: 'scale(1.03)' },
              }}
            >
              <UserAvatar name={name || '?'} color={color} image={o.id || null} size={96} sx={{ width: '100%', height: 'auto', aspectRatio: '1' }} />
              {selected && (
                <Box
                  sx={{ position: 'absolute', right: 2, bottom: 2, width: 26, height: 26, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', '& svg': { fontSize: 18 } }}
                >
                  <CheckIcon />
                </Box>
              )}
            </ButtonBase>
          )
        })}
      </Box>
    </Box>
  )
}
