import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

/** One label/value line of the info card, separated from the next by a hairline. */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 2,
        py: 1.1,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  )
}
