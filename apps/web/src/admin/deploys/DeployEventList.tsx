import List from '@mui/material/List'
import Typography from '@mui/material/Typography'
import type { DeployEvent } from '../data/useDeployStatus'
import { DeployEventRow } from './DeployEventRow'

type Props = {
  events: readonly DeployEvent[]
  selectedId: string | null
  disabled: boolean
  onSelect: (id: string) => void
  onRollback: (event: DeployEvent) => void
}

export function DeployEventList({ events, selectedId, disabled, onSelect, onRollback }: Props) {
  if (events.length === 0) return <Typography color="text.secondary">No deploys yet.</Typography>
  return (
    <List disablePadding aria-label="Deploy history">
      {events.map((event) => (
        <DeployEventRow
          key={event.id}
          event={event}
          selected={event.id === selectedId}
          disabled={disabled}
          onSelect={() => onSelect(event.id)}
          onRollback={() => onRollback(event)}
        />
      ))}
    </List>
  )
}
