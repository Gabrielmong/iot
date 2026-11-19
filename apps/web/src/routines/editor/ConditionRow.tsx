import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import type { ConditionMetric, ConditionOp } from '../../gql/graphql'
import { METRIC_ORDER, METRICS, OP_LABEL } from '../lib/conditionMetrics'
import type { DraftCondition } from '../lib/draft'

type Props = { number: number; condition: DraftCondition; onChange: (next: DraftCondition) => void; onRemove?: () => void }

/** A metric picked fresh: its first op, and the old value only if both are numbers. */
function withMetric(c: DraftCondition, metric: ConditionMetric): DraftCondition {
  const numeric = METRICS[metric].range !== undefined
  const keepValue = numeric && METRICS[c.metric].range !== undefined
  return { ...c, metric, op: METRICS[metric].ops[0]!, value: keepValue ? c.value : null }
}

/** One check: what to look at, how (only the ops that metric allows), and a number with its unit when numeric. */
export function ConditionRow({ number, condition, onChange, onRemove }: Props) {
  const { ops, range } = METRICS[condition.metric]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <TextField
        select
        size="small"
        label={`Check ${number}`}
        value={condition.metric}
        onChange={(e) => onChange(withMetric(condition, e.target.value as ConditionMetric))}
        sx={{ minWidth: 190 }}
      >
        {METRIC_ORDER.map((m) => (
          <MenuItem key={m} value={m}>
            {METRICS[m].label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={`Check ${number} is`}
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as ConditionOp })}
        sx={{ minWidth: 110 }}
      >
        {ops.map((op) => (
          <MenuItem key={op} value={op}>
            {OP_LABEL[op]}
          </MenuItem>
        ))}
      </TextField>
      {range && (
        <TextField
          type="number"
          size="small"
          label="Value"
          value={condition.value ?? ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value === '' ? null : Number(e.target.value) })}
          slotProps={{
            htmlInput: { min: range.min, max: range.max },
            input: { endAdornment: <InputAdornment position="end">{range.unit.trim()}</InputAdornment> },
          }}
          sx={{ width: 130 }}
        />
      )}
      {onRemove && (
        <IconButton aria-label={`Remove check ${number}`} onClick={onRemove}>
          <DeleteOutlineIcon />
        </IconButton>
      )}
    </Box>
  )
}
