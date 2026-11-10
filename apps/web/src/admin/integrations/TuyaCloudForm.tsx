import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useCallback, useState } from 'react'
import { SelectField } from '../../common/SelectField'
import { SecretField } from '../common/SecretField'
import { useSubmit } from '../common/useSubmit'
import { useSetTuyaCloud } from '../data/useSetTuyaCloud'
import { SaveOutcome } from './SaveOutcome'

const REGIONS = ['us', 'eu', 'cn', 'in'].map((r) => ({ value: r, label: r.toUpperCase() }))

/** Tuya cloud credentials. The secret is write-only: empty on load and cleared after saving. */
export function TuyaCloudForm() {
  const save = useSetTuyaCloud()
  const [accessId, setAccessId] = useState('')
  const [accessSecret, setAccessSecret] = useState('')
  const [region, setRegion] = useState('eu')
  const [saved, setSaved] = useState(false)
  const run = useCallback(() => save({ accessId: accessId.trim(), accessSecret, region }), [save, accessId, accessSecret, region])
  const done = useCallback(() => {
    setAccessSecret('')
    setSaved(true)
  }, [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={2}>
      <TextField label="Access ID" value={accessId} onChange={(e) => setAccessId(e.target.value)} autoComplete="off" fullWidth />
      <SecretField label="Access Secret" value={accessSecret} onChange={(e) => { setAccessSecret(e.target.value); setSaved(false) }} />
      <SelectField label="Region" value={region} options={REGIONS} onChange={setRegion} />
      <SaveOutcome error={error} saved={saved} />
      <Button variant="contained" size="large" disabled={pending || accessId.trim() === '' || accessSecret === ''} onClick={() => void submit()}>
        Save Tuya cloud
      </Button>
    </Stack>
  )
}
