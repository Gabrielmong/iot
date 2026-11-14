import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Fragment, type ReactNode } from 'react'
import type { DeployEvent } from '../data/useDeployStatus'
import { DeployEventRow } from './DeployEventRow'

type Props = {
  events: readonly DeployEvent[]
  selectedId: string | null
  disabled: boolean
  onSelect: (id: string) => void
  onRollback: (event: DeployEvent) => void
  /** Shown right under the selected row (phones); omitted when the log sits beside the list. */
  selectedLog?: ReactNode
}

export function DeployEventList({ events, selectedId, disabled, onSelect, onRollback, selectedLog }: Props) {
  if (events.length === 0) return <Typography color="text.secondary">No deploys yet.</Typography>
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <List disablePadding aria-label="Deploy history">
        {events.map((event) => {
          const selected = event.id === selectedId
          return (
            <Fragment key={event.id}>
              <DeployEventRow
                event={event}
                selected={selected}
                disabled={disabled}
                onSelect={() => onSelect(event.id)}
                onRollback={() => onRollback(event)}
              />
              {selected && selectedLog && (
                <ListItem divider sx={{ display: 'block', px: 1, py: 1, bgcolor: 'action.hover' }}>{selectedLog}</ListItem>
              )}
            </Fragment>
          )
        })}
      </List>
    </Paper>
  )
}
