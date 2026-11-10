import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

type Props = { what: string; onRetry: () => void }

/** Shown when a page's query failed and there is nothing cached to show instead. */
export function QueryError({ what, onRetry }: Props) {
  return (
    <Alert severity="error" action={<Button color="inherit" size="large" onClick={onRetry}>Retry</Button>}>
      {`Couldn't load ${what}.`}
    </Alert>
  )
}
