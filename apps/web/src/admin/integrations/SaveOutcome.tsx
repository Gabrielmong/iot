import Alert from '@mui/material/Alert'

/** Inline outcome of a credentials form: the error text, or "Saved." once it succeeds. */
export function SaveOutcome({ error, saved }: { error: string | null; saved: boolean }) {
  if (error) return <Alert severity="error">{error}</Alert>
  if (saved) return <Alert severity="success">Saved.</Alert>
  return null
}
