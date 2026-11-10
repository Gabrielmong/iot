import Box from '@mui/material/Box'

/** Small circle showing a light's current color, with a soft halo of the same colour. */
export function ColorDot({ color }: { color: string }) {
  return (
    <Box
      aria-hidden
      style={{ backgroundColor: color, boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)` }}
      sx={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        flexShrink: 0,
        border: 1,
        borderColor: 'divider',
        transition: 'background-color 300ms, box-shadow 300ms',
      }}
    />
  )
}
