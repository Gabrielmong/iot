import { SelectField } from '../../common/SelectField'
import { KIND_LABELS } from '../lib/deviceLabels'

type Props = { value: string; onChange: (kind: string) => void }

const DRIVER_KINDS = new Set(['TV', 'COMPUTER'])

export function KindSelect({ value, onChange }: Props) {
  // TVs and computers come from their own drivers: one stays what it is, and nothing else becomes one.
  const options = Object.entries(KIND_LABELS)
    .filter(([v]) => (DRIVER_KINDS.has(value) ? v === value : !DRIVER_KINDS.has(v)))
    .map(([v, label]) => ({ value: v, label }))
  return <SelectField label="Kind" value={value} options={options} onChange={onChange} />
}
