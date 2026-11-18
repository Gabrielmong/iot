import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import type { PcFlags } from '../lib/pcGrants'

type Props = { userName: string; flags: PcFlags; onChange: (flags: PcFlags) => void }

const LABELS: Record<keyof PcFlags, string> = { stats: 'Live stats', power: 'Power actions' }

/** A granted user's extra rights on a PC, indented under their name. */
export function PcPermissionChecks({ userName, flags, onChange }: Props) {
  return (
    <Stack direction="row" spacing={1} sx={{ pl: 4, flexWrap: 'wrap' }}>
      {(Object.keys(LABELS) as (keyof PcFlags)[]).map((key) => (
        <FormControlLabel
          key={key}
          label={LABELS[key]}
          control={
            <Checkbox
              size="small"
              checked={flags[key]}
              onChange={(e) => onChange({ ...flags, [key]: e.target.checked })}
              slotProps={{ input: { 'aria-label': `${LABELS[key]} for ${userName}` } }}
            />
          }
        />
      ))}
    </Stack>
  )
}
