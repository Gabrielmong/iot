import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import type { SxProps, Theme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import type { CiJob } from '../data/useDeployStatus'

/** Stands in for the log panel while a job is unfinished: GitHub only serves logs of finished jobs. */
export function CiJobPending({ job, sx }: { job: CiJob; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[
        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, p: 3, borderRadius: 2, border: 1, borderColor: 'divider', textAlign: 'center' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography color="text.secondary">Log is available when the job finishes</Typography>
      <Link href={job.url} target="_blank" rel="noopener noreferrer" variant="body2">Open the job in GitHub</Link>
    </Box>
  )
}
