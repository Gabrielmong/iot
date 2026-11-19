import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import type { DraftCondition } from '../lib/draft'
import { ConditionList } from './ConditionList'

type Props = { conditions: DraftCondition[]; onChange: (conditions: DraftCondition[]) => void }

/** Stops the routine here unless every check holds. */
export function ContinueIfStepCard({ conditions, onChange }: Props) {
  return (
    <Stack spacing={1}>
      <ConditionList conditions={conditions} onChange={onChange} />
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Otherwise the routine stops here.
      </Typography>
    </Stack>
  )
}
