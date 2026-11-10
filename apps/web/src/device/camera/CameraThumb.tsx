import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { CLOUD_UNAVAILABLE_MESSAGE } from '../lib/cloudStream'
import { formatFrameAge } from '../lib/thumbnailAge'
import type { ThumbnailView } from './useThumbnail'

const ageLabel = {
  position: 'absolute',
  left: 6,
  bottom: 6,
  px: 0.75,
  borderRadius: 0.5,
  color: 'common.white',
  bgcolor: 'rgba(0, 0, 0, 0.55)',
} as const

type Props = Omit<ThumbnailView, 'cloudUnavailable'> & {
  cloudUnavailable?: boolean
  /** Fill the parent's height instead of keeping 16:9 (dashboard cards of any size). */
  fill?: boolean
}

/** The camera's latest frame with its age, or "No recent image" (or the cloud's refusal) when it is stale. */
export function CameraThumb({ src, ageSeconds, stale, cloudUnavailable = false, fill = false }: Props) {
  return (
    <Box sx={{ position: 'relative', width: '100%', ...(fill ? { height: '100%' } : { aspectRatio: '16 / 9' }), bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
      {stale ? (
        <Typography variant="body2" color="text.secondary" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          {cloudUnavailable ? CLOUD_UNAVAILABLE_MESSAGE : 'No recent image'}
        </Typography>
      ) : (
        src && (
          <>
            <Box component="img" src={src} alt="Latest camera image" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            {ageSeconds !== null && (
              <Typography variant="caption" sx={ageLabel}>
                {formatFrameAge(ageSeconds)}
              </Typography>
            )}
          </>
        )
      )}
    </Box>
  )
}
