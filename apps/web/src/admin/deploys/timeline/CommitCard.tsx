import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import type { DeployEvent } from '../../data/useDeployStatus'
import { relativeTime, shortSha } from '../deployLabels'
import { ShaChip } from '../ShaChip'
import type { CommitEntry } from './buildTimeline'
import { CiRunSection } from './CiRunSection'
import { DeployStage } from './DeployStage'
import { holdsSelection, type Selection } from './selection'

type Props = {
  entry: CommitEntry
  selection: Selection | null
  paused: boolean
  disabled: boolean
  onSelect: (s: Selection) => void
  onRollback: (e: DeployEvent) => void
  /** Shown at the bottom of the card holding the selection (phones). */
  selectedLog?: ReactNode
}

/** One commit, top to bottom: the commit, its CI runs, its deploy stage. */
export function CommitCard({ entry, selection, paused, disabled, onSelect, onRollback, selectedLog }: Props) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 1.5, pt: 1.25, pb: 0.75 }}>
        <ShaChip sha={shortSha(entry.sha)} />
        <Typography noWrap title={entry.message ?? undefined} sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
          {entry.message ?? ''}
        </Typography>
        {entry.running && <Chip label="Running" size="small" color="success" variant="outlined" />}
        {entry.committedAt && (
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{relativeTime(entry.committedAt)}</Typography>
        )}
      </Box>
      <Box sx={{ px: 0.5, pb: 0.5 }}>
        {entry.runs.map((run) => (
          <CiRunSection key={run.id} run={run} selection={selection} onSelect={onSelect} />
        ))}
        {entry.runs.length > 0 && (entry.attempts.length > 0 || entry.pending) && <Divider sx={{ my: 0.5 }} />}
        <DeployStage
          entry={entry}
          selection={selection}
          paused={paused}
          disabled={disabled}
          onSelect={onSelect}
          onRollback={onRollback}
        />
      </Box>
      {selectedLog && holdsSelection(entry, selection) && <Box sx={{ p: 1, bgcolor: 'action.hover' }}>{selectedLog}</Box>}
    </Box>
  )
}
