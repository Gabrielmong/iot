import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { SelectField } from '../../common/SelectField'
import type { Room } from '../../dashboard/types'
import { ROUTINE_LIMITS } from '../lib/draftErrors'

type Props = { name: string; roomId: string | null; rooms: readonly Room[]; onChange: (patch: { name?: string; roomId?: string | null }) => void }

const WHOLE_HOUSE = ''

/** The routine's name and which dashboard tab it shows on ("Whole house" = only under All). */
export function NameRoomFields({ name, roomId, rooms, onChange }: Props) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        label="Name"
        value={name}
        onChange={(e) => onChange({ name: e.target.value })}
        slotProps={{ htmlInput: { maxLength: ROUTINE_LIMITS.maxName } }}
        placeholder="Movie night"
        sx={{ flex: 2 }}
      />
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <SelectField
          label="Show on"
          value={roomId ?? WHOLE_HOUSE}
          options={[{ value: WHOLE_HOUSE, label: 'Whole house' }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]}
          onChange={(v) => onChange({ roomId: v === WHOLE_HOUSE ? null : v })}
        />
      </Box>
    </Stack>
  )
}
