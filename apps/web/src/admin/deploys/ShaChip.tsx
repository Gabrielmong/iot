import Box from '@mui/material/Box'

/** A short commit hash in a quiet monospace pill. */
export function ShaChip({ sha }: { sha: string }) {
  return (
    <Box
      component="code"
      sx={{
        flexShrink: 0,
        px: 0.75,
        py: 0.25,
        mt: '2px',
        borderRadius: 1,
        bgcolor: 'action.selected',
        color: 'text.primary',
        fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {sha}
    </Box>
  )
}
