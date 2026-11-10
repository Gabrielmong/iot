import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router'
import { KASA_LOGIN_NOTE } from '../lib/kasaNote'

/** Explains why no Kasa devices show up, with a link to where credentials are saved. */
export function KasaHint() {
  return (
    <Alert severity="info" sx={{ mb: 3 }}>
      <span>{KASA_LOGIN_NOTE}</span>{' '}
      <Link component={RouterLink} to="/admin/integrations/kasa">Go to Integrations</Link>
    </Alert>
  )
}
