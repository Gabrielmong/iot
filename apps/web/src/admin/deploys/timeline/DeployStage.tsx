import Box from '@mui/material/Box'
import ListItemButton from '@mui/material/ListItemButton'
import Typography from '@mui/material/Typography'
import type { DeployEvent } from '../../data/useDeployStatus'
import { RollbackButton } from '../RollbackButton'
import { attemptTitle, metaLine, showsRollback, statusIcon } from '../deployLabels'
import type { CommitEntry, PendingDeploy } from './buildTimeline'
import { selectableSx } from './selectableSx'
import { isSelected, type Selection } from './selection'

type Props = {
  entry: CommitEntry
  selection: Selection | null
  paused: boolean
  disabled: boolean
  onSelect: (s: Selection) => void
  onRollback: (e: DeployEvent) => void
}

function pendingText(pending: Exclude<PendingDeploy, null>, paused: boolean): string {
  switch (pending) {
    case 'WAITING_FOR_TESTS':
      return 'Waiting for tests'
    case 'SUPERSEDED':
      return 'Superseded'
    case 'WAITING_TO_DEPLOY':
      return paused ? 'Waiting to deploy (auto-deploy paused)' : 'Waiting to deploy'
  }
}

/** The card's deploy stage: one selectable line per attempt, or what the commit is waiting for. */
export function DeployStage({ entry, selection, paused, disabled, onSelect, onRollback }: Props) {
  if (entry.attempts.length === 0) {
    if (!entry.pending) return null
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 0.75 }}>
        {pendingText(entry.pending, paused)}
      </Typography>
    )
  }
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {entry.attempts.map((event) => {
        const selected = isSelected(selection, 'event', event.id)
        return (
          <Box component="li" key={event.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ListItemButton
              selected={selected}
              onClick={() => onSelect({ kind: 'event', id: event.id })}
              aria-current={selected ? 'true' : undefined}
              sx={[{ gap: 1, py: 0.75, px: 1, minWidth: 0 }, selectableSx]}
            >
              <Box sx={{ display: 'flex' }}>{statusIcon(event.status)}</Box>
              <Typography sx={{ fontWeight: 600, flexShrink: 0 }}>{attemptTitle(event.status)}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{metaLine(event)}</Typography>
            </ListItemButton>
            {showsRollback(event) && (
              <RollbackButton event={event} disabled={disabled} onClick={() => onRollback(event)} sx={{ flexShrink: 0, pr: 1 }} />
            )}
          </Box>
        )
      })}
    </Box>
  )
}
