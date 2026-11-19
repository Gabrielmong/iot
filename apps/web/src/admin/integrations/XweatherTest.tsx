import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useCallback, useState } from 'react'
import { useSubmit } from '../common/useSubmit'
import { useTestXweather } from '../data/useWeatherIntegrations'

/** "Test connection": fetches the weather once and says whether it worked. */
export function XweatherTest() {
  const test = useTestXweather()
  const [ok, setOk] = useState(false)
  const run = useCallback(() => {
    setOk(false)
    return test()
  }, [test])
  const done = useCallback(() => setOk(true), [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Button variant="outlined" disabled={pending} onClick={() => void submit()}>
        Test connection
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {ok && !error && <Alert severity="success">Connected</Alert>}
    </Stack>
  )
}
