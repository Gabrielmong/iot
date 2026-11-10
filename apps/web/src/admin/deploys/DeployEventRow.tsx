import Button from '@mui/material/Button'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import type { DeployEvent } from '../data/useDeployStatus'
import { eventTitle, formatDuration, relativeTime, statusIcon, whoLabel } from './deployLabels'

type Props = {
  event: DeployEvent
  selected: boolean
  /** Disables the rollback button (an operation is running). */
  disabled: boolean
  onSelect: () => void
  onRollback: () => void
}

function secondaryLine(event: DeployEvent): string {
  const parts = [event.message, whoLabel(event.by), relativeTime(event.startedAt)]
  if (event.finishedAt) parts.push(formatDuration(event.startedAt, event.finishedAt))
  if (event.detail) parts.push(event.detail)
  return parts.filter(Boolean).join(' · ')
}

function RollbackButton({ event, disabled, onClick }: { event: DeployEvent; disabled: boolean; onClick: () => void }) {
  const blocked = event.rollbackBlockedReason
  return (
    <Tooltip title={blocked ?? ''}>
      <span>
        <Button size="small" disabled={disabled || Boolean(blocked)} onClick={onClick}>Roll back to this</Button>
      </span>
    </Tooltip>
  )
}

/** One history entry: status icon, title and details, with a rollback action where allowed. */
export function DeployEventRow({ event, selected, disabled, onSelect, onRollback }: Props) {
  const showRollback = event.canRollback || Boolean(event.rollbackBlockedReason)
  return (
    <ListItem
      disablePadding
      divider
      secondaryAction={showRollback ? <RollbackButton event={event} disabled={disabled} onClick={onRollback} /> : undefined}
    >
      <ListItemButton selected={selected} onClick={onSelect} sx={{ pr: showRollback ? 20 : 2 }}>
        <ListItemIcon sx={{ minWidth: 36 }}>{statusIcon(event.status)}</ListItemIcon>
        <ListItemText primary={eventTitle(event)} secondary={secondaryLine(event)} />
      </ListItemButton>
    </ListItem>
  )
}
