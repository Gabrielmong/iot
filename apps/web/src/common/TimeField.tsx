import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import dayjs, { type Dayjs } from 'dayjs'

type Props = { label: string; value: string; onChange: (value: string) => void; size?: 'small' | 'medium' }

const FORMAT = 'HH:mm'
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** An MUI time picker for an "HH:MM" (24-hour) string; incomplete or invalid entries aren't reported. */
export function TimeField({ label, value, onChange, size = 'small' }: Props) {
  const parsed = HH_MM.test(value) ? dayjs(`2000-01-01T${value}`) : null
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <TimePicker
        label={label}
        ampm={false}
        value={parsed}
        onChange={(next: Dayjs | null) => {
          if (next?.isValid()) onChange(next.format(FORMAT))
        }}
        slotProps={{ textField: { size } }}
        sx={{ width: 150 }}
      />
    </LocalizationProvider>
  )
}
