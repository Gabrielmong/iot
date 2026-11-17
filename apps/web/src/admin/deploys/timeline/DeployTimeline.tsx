import Box from '@mui/material/Box'
import List from '@mui/material/List'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import type { DeployEvent } from '../../data/useDeployStatus'
import { DeployEventRow } from '../DeployEventRow'
import type { TimelineEntry } from './buildTimeline'
import { CommitCard } from './CommitCard'
import { holdsSelection, isSelected, type Selection } from './selection'

type Props = {
  entries: readonly TimelineEntry[]
  selection: Selection | null
  paused: boolean
  disabled: boolean
  onSelect: (s: Selection) => void
  onRollback: (e: DeployEvent) => void
  /** Shown under the card or row holding the selection (phones); omitted when the log sits beside the list. */
  selectedLog?: ReactNode
}

/** The deploy history: a card per commit, a row per other action, newest activity first. */
export function DeployTimeline({ entries, selection, paused, disabled, onSelect, onRollback, selectedLog }: Props) {
  if (entries.length === 0) return <Typography color="text.secondary">No deploys yet.</Typography>
  return (
    <Box component="ul" aria-label="Deploy history" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
      {entries.map((entry) => (
        <Paper component="li" key={entry.key} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {entry.type === 'commit' ? (
            <CommitCard
              entry={entry}
              selection={selection}
              paused={paused}
              disabled={disabled}
              onSelect={onSelect}
              onRollback={onRollback}
              selectedLog={selectedLog}
            />
          ) : (
            <>
              <List disablePadding>
                <DeployEventRow
                  event={entry.event}
                  selected={isSelected(selection, 'event', entry.event.id)}
                  disabled={disabled}
                  onSelect={() => onSelect({ kind: 'event', id: entry.event.id })}
                  onRollback={() => onRollback(entry.event)}
                />
              </List>
              {selectedLog && holdsSelection(entry, selection) && <Box sx={{ p: 1, bgcolor: 'action.hover' }}>{selectedLog}</Box>}
            </>
          )}
        </Paper>
      ))}
    </Box>
  )
}
