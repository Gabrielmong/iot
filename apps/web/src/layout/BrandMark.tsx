import Box from '@mui/material/Box'

/** A small house with a lit window: the app's mark. Decorative. */
export function BrandMark() {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 26, height: 26, flexShrink: 0 }}>
      <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" opacity="0.85" />
      <Box component="rect" x="9.5" y="12" width="5" height="5" rx="1" sx={{ fill: 'var(--mui-palette-primary-main)', filter: 'drop-shadow(0 0 4px var(--mui-palette-primary-main))' }} />
    </Box>
  )
}
