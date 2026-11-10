import { SelectField } from '../../common/SelectField'
import type { Room } from '../types'

type Props = { rooms: readonly Room[]; value: string; onChange: (roomId: string) => void }

/** Room picker; an empty value means "No room". */
export function RoomSelect({ rooms, value, onChange }: Props) {
  const options = [{ value: '', label: 'No room' }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]
  return <SelectField label="Room" value={value} options={options} onChange={onChange} />
}
