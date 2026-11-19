import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { TimeField } from '../../common/TimeField'
import type { ScheduleAnchor } from '../../gql/graphql'
import type { DraftSchedule } from '../lib/draft'
import { SunScheduleFields } from './SunScheduleFields'

type Props = {
  number: number
  schedule: DraftSchedule
  /** No home location yet, so sunrise and sunset aren't known. */
  needsLocation: boolean
  onChange: (patch: Partial<Omit<DraftSchedule, 'key'>>) => void
  onRemove: () => void
}

const ANCHORS: { value: ScheduleAnchor; label: string }[] = [
  { value: 'CLOCK', label: 'Time' },
  { value: 'SUNRISE', label: 'Sunrise' },
  { value: 'SUNSET', label: 'Sunset' },
]

const DAYS = [
  { day: 1, short: 'M', name: 'Monday' },
  { day: 2, short: 'T', name: 'Tuesday' },
  { day: 3, short: 'W', name: 'Wednesday' },
  { day: 4, short: 'T', name: 'Thursday' },
  { day: 5, short: 'F', name: 'Friday' },
  { day: 6, short: 'S', name: 'Saturday' },
  { day: 7, short: 'S', name: 'Sunday' },
] as const

/** One scheduled time: a clock time or sunrise/sunset (± minutes), the weekdays it runs on, and an on/off switch. */
export function ScheduleRow({ number, schedule, needsLocation, onChange, onRemove }: Props) {
  const sun = schedule.anchor !== 'CLOCK'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <TextField select size="small" label="At" value={schedule.anchor} onChange={(e) => onChange({ anchor: e.target.value as ScheduleAnchor })} sx={{ width: 120 }}>
        {ANCHORS.map((a) => (
          <MenuItem key={a.value} value={a.value}>
            {a.label}
          </MenuItem>
        ))}
      </TextField>
      {sun ? (
        <SunScheduleFields number={number} offsetMinutes={schedule.offsetMinutes} onChange={(offsetMinutes) => onChange({ offsetMinutes })} />
      ) : (
        <TimeField label="Time" value={schedule.time} onChange={(time) => onChange({ time })} />
      )}
      <ToggleButtonGroup
        size="small"
        aria-label={`Days for time ${number}`}
        value={schedule.days}
        onChange={(_, days: number[]) => onChange({ days: [...days].sort((a, b) => a - b) })}
      >
        {DAYS.map((d) => (
          <ToggleButton key={d.day} value={d.day} aria-label={d.name} sx={{ px: 1.25 }}>
            {d.short}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Switch checked={schedule.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} slotProps={{ input: { 'aria-label': `Time ${number} on` } }} />
      <IconButton aria-label={`Remove time ${number}`} onClick={onRemove}>
        <DeleteOutlineIcon />
      </IconButton>
      {sun && needsLocation && (
        <Typography variant="body2" color="warning.main" sx={{ flexBasis: '100%' }}>
          Needs the home location
        </Typography>
      )}
    </Box>
  )
}
