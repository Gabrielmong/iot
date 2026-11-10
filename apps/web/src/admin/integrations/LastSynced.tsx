import Typography from '@mui/material/Typography'
import { formatLastSeen } from '../lib/formatLastSeen'

/** "Last synced: 5 min ago", or "Last synced: Never". */
export function LastSynced({ at }: { at: string | null }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {`Last synced: ${formatLastSeen(at)}`}
    </Typography>
  )
}
