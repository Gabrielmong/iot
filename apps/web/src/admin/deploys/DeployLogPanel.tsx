import Box from '@mui/material/Box'
import { useEffect, useRef } from 'react'

type Props = { log: string | null; loading: boolean; live: boolean }

/** The selected event's log on a dark monospace surface; follows the end while live. */
export function DeployLogPanel({ log, loading, live }: Props) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [log, live])
  return (
    <Box
      component="pre"
      ref={ref}
      aria-label="Deploy log"
      sx={{
        m: 0,
        p: 2,
        minHeight: 240,
        maxHeight: '60vh',
        overflow: 'auto',
        borderRadius: 2,
        bgcolor: 'grey.900',
        color: log === null ? 'grey.500' : 'grey.100',
        fontFamily: 'monospace',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {log ?? (loading ? 'Loading…' : 'No log for this event.')}
    </Box>
  )
}
