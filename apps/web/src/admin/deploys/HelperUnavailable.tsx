import Alert from '@mui/material/Alert'

/** Shown instead of the page when the deploy helper service isn't reachable. */
export function HelperUnavailable() {
  return (
    <Alert severity="info">
      The deploy helper isn't running on this computer. See Deploying in docs/RUNNING.md.
    </Alert>
  )
}
