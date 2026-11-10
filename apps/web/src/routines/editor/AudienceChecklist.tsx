import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Typography from '@mui/material/Typography'
import { useUsers } from '../../admin/data/useUsers'

type Props = { selected: readonly string[]; onChange: (userIds: string[]) => void; includeGuests: boolean }

/** Admin, shared routines and camera groups: which users see it (admins always do). Guests only see routines. */
export function AudienceChecklist({ selected, onChange, includeGuests }: Props) {
  const users = useUsers().users.filter((u) => u.role === 'USER' || (includeGuests && u.role === 'GUEST'))
  const toggle = (id: string, on: boolean) => onChange(on ? [...selected, id] : selected.filter((s) => s !== id))
  return (
    <FormGroup role="group" aria-label="Who can see it" row>
      {users.length === 0 && <Typography sx={{ color: 'text.secondary' }}>No regular users yet: only admins will see it.</Typography>}
      {users.map((u) => (
        <FormControlLabel key={u.id} label={u.name} control={<Checkbox checked={selected.includes(u.id)} onChange={(e) => toggle(u.id, e.target.checked)} />} />
      ))}
    </FormGroup>
  )
}
