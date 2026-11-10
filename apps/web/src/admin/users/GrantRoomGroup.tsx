import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import { checkState } from '../lib/grantSelection'
import type { RoomGroup } from '../lib/groupDevicesByRoom'
import type { AdminDevice } from '../types'

type Props = {
  group: RoomGroup<AdminDevice>
  selected: ReadonlySet<string>
  onToggleRoom: (ids: string[], checked: boolean) => void
  onToggleDevice: (id: string) => void
}

/** One room's devices as checkboxes, with an "All in room" toggle on top. */
export function GrantRoomGroup({ group, selected, onToggleRoom, onToggleDevice }: Props) {
  const ids = group.devices.map((d) => d.id)
  const state = checkState(selected, ids)
  return (
    <FormGroup sx={{ mb: 2 }}>
      <FormControlLabel
        label={group.roomId ? `All in ${group.name}` : 'All with no room'}
        slotProps={{ typography: { sx: { fontWeight: 600 } } }}
        control={
          <Checkbox checked={state === 'all'} indeterminate={state === 'some'} onChange={(e) => onToggleRoom(ids, e.target.checked)} />
        }
      />
      {group.devices.map((d) => (
        <FormControlLabel
          key={d.id}
          label={d.name}
          sx={{ ml: 2 }}
          control={<Checkbox checked={selected.has(d.id)} onChange={() => onToggleDevice(d.id)} />}
        />
      ))}
    </FormGroup>
  )
}
