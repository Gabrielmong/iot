import Avatar from '@mui/material/Avatar'
import type { SxProps, Theme } from '@mui/material/styles'
import { avatarImageSrc } from './avatarImages'

type Props = {
  name: string
  color: string
  image?: string | null
  /** Diameter in px. */
  size?: number
  /** A soft glow in the user's color (the sign-in picker). */
  glow?: boolean
  sx?: SxProps<Theme>
}

/**
 * A user's avatar: their picture ringed in their color, or their initial on their color.
 * Decorative: the name is always shown or announced next to it.
 */
export function UserAvatar({ name, color, image, size = 40, glow = false, sx }: Props) {
  const src = avatarImageSrc(image)
  const ring = src ? `0 0 0 ${Math.max(2, Math.round(size / 20))}px ${color}` : null
  const halo = glow ? `0 8px 28px color-mix(in srgb, ${color} 45%, transparent)` : null
  return (
    <Avatar
      src={src}
      alt=""
      aria-hidden
      sx={[
        {
          width: size,
          height: size,
          fontSize: Math.round(size * 0.43),
          fontWeight: 700,
          bgcolor: color,
          color: '#fff',
          boxShadow: [ring, halo].filter(Boolean).join(', ') || undefined,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {name.charAt(0).toUpperCase()}
    </Avatar>
  )
}
