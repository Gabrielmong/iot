import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import { gridSx } from './lib/gridSx'

/** Placeholder tiles shown while devices load the first time. */
export function DeviceGridSkeleton() {
  return (
    <Box
      role="progressbar"
      aria-label="Loading devices"
      sx={{ ...gridSx, mt: 2 }}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} variant="rounded" height="100%" sx={{ borderRadius: '10px' }} />
      ))}
    </Box>
  )
}
