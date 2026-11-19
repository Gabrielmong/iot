import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { MAX_CONDITIONS } from '../lib/conditionMetrics'
import type { DraftCondition } from '../lib/draft'
import { newCondition } from '../lib/draftOps'
import { ConditionRow } from './ConditionRow'

type Props = { conditions: DraftCondition[]; onChange: (conditions: DraftCondition[]) => void }

/** A step's weather checks (all must hold): 1 to 5, each removable while more than one is left. */
export function ConditionList({ conditions, onChange }: Props) {
  return (
    <Stack spacing={1}>
      {conditions.map((c, i) => (
        <ConditionRow
          key={c.key}
          number={i + 1}
          condition={c}
          onChange={(next) => onChange(conditions.map((x) => (x.key === c.key ? next : x)))}
          onRemove={conditions.length > 1 ? () => onChange(conditions.filter((x) => x.key !== c.key)) : undefined}
        />
      ))}
      {conditions.length < MAX_CONDITIONS && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...conditions, newCondition()])} sx={{ alignSelf: 'flex-start' }}>
          And also
        </Button>
      )}
    </Stack>
  )
}
