import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { SxProps, Theme } from '@mui/material/styles'
import { useStickToBottom } from './useStickToBottom'

type Props = {
  log: string | null
  loading: boolean
  live: boolean
  /** Height rules from the layout (beside the list on desktop, under a row on mobile). */
  sx?: SxProps<Theme>
}

/**
 * The selected event's log on a dark monospace surface. Opens at the last line and follows new lines
 * until the user scrolls up; then "Jump to latest" brings them back. Remount (key) per event.
 */
export function DeployLogPanel({ log, loading, live, sx }: Props) {
  const { ref, pinned, onScroll, jumpToEnd } = useStickToBottom<HTMLPreElement>(log)
  return (
    <Box sx={[{ position: 'relative', display: 'flex', minHeight: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box
        component="pre"
        ref={ref}
        onScroll={onScroll}
        aria-label="Deploy log"
        aria-live={live ? 'polite' : undefined}
        sx={{
          m: 0,
          p: 2,
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: '#070b16',
          color: log === null ? 'text.secondary' : 'grey.100',
          fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {log ?? (loading ? 'Loading…' : 'No log for this event.')}
      </Box>
      {!pinned && (
        <Button
          size="small"
          variant="contained"
          startIcon={<ArrowDownwardIcon />}
          onClick={jumpToEnd}
          sx={{ position: 'absolute', right: 12, bottom: 12, boxShadow: 4 }}
        >
          Jump to latest
        </Button>
      )}
    </Box>
  )
}
