import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Draft } from '../lib/draft'
import { addSchedule, removeSchedule, updateSchedule } from '../lib/draftOps'
import { ScheduleRow } from './ScheduleRow'

type Props = { draft: Draft; onChange: (draft: Draft) => void }

/** When the routine starts by itself (server local time). None means tap-only. */
export function ScheduleList({ draft, onChange }: Props) {
  return (
    <Stack spacing={1.5}>
      {draft.schedules.length === 0 && <Typography sx={{ color: 'text.secondary' }}>Runs only when tapped.</Typography>}
      {draft.schedules.map((s, i) => (
        <ScheduleRow
          key={s.key}
          number={i + 1}
          schedule={s}
          onChange={(patch) => onChange(updateSchedule(draft, s.key, patch))}
          onRemove={() => onChange(removeSchedule(draft, s.key))}
        />
      ))}
      <Button startIcon={<AddIcon />} onClick={() => onChange(addSchedule(draft))} sx={{ alignSelf: 'flex-start' }}>
        Add time
      </Button>
    </Stack>
  )
}
