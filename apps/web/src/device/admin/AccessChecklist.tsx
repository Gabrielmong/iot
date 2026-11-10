import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Typography from '@mui/material/Typography'
import type { AdminUser } from '../../admin/types'

type Props = {
  users: readonly AdminUser[]
  selected: ReadonlySet<string>
  onToggle: (userId: string) => void
  /** Cameras and computers can't be granted to guests, so guests aren't listed for them. */
  guestHidden?: boolean
}

/** Admins first (always on, disabled), then one checkbox per other user. */
export function AccessChecklist({ users, selected, onToggle, guestHidden = false }: Props) {
  const admins = users.filter((u) => u.role === 'ADMIN')
  const others = users.filter((u) => u.role !== 'ADMIN' && !(guestHidden && u.role === 'GUEST'))
  return (
    <FormGroup>
      {admins.map((u) => (
        <FormControlLabel key={u.id} control={<Checkbox checked disabled />} label={<AdminLabel name={u.name} />} />
      ))}
      {others.map((u) => (
        <FormControlLabel
          key={u.id}
          control={<Checkbox checked={selected.has(u.id)} onChange={() => onToggle(u.id)} />}
          label={u.name}
        />
      ))}
    </FormGroup>
  )
}

function AdminLabel({ name }: { name: string }) {
  return (
    <>
      {name}{' '}
      <Typography component="span" variant="body2" color="text.secondary">
        always has access
      </Typography>
    </>
  )
}
