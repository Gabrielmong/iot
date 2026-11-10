import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { useState } from 'react'
import type { Device, Room } from '../../dashboard/types'
import { describeAction } from '../lib/describeAction'
import type { DraftAction } from '../lib/draft'
import { fitDraftAction } from '../lib/usableDevices'
import { ActionDialog } from './ActionDialog'
import { DevicePickerDialog } from './DevicePickerDialog'

type Props = {
  actions: readonly DraftAction[]
  devices: readonly Device[]
  rooms: readonly Room[]
  onUpsert: (action: DraftAction) => void
  onRemove: (deviceId: string) => void
}

const newAction = (deviceId: string): DraftAction => ({ deviceId, on: true, brightness: null, color: null, colorTempK: null, unavailable: false })
const UNAVAILABLE = 'Unavailable device'

/** A "set devices" step: its devices with what each is set to; tap one to change it, or add another. */
export function SetStepCard({ actions, devices, rooms, onUpsert, onRemove }: Props) {
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<{ device: Device; action: DraftAction } | null>(null)
  const byId = new Map(devices.map((d) => [d.id, d]))
  const used = new Set(actions.map((a) => a.deviceId))
  return (
    <>
      <List dense disablePadding>
        {actions.map((a) => {
          const device = a.unavailable ? undefined : byId.get(a.deviceId)
          const name = device?.name ?? UNAVAILABLE
          return (
            <ListItem
              key={a.deviceId}
              disablePadding
              secondaryAction={
                <IconButton edge="end" aria-label={`Remove ${name}`} onClick={() => onRemove(a.deviceId)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            >
              {device ? (
                <ListItemButton onClick={() => setEditing({ device, action: a })}>
                  <ListItemText primary={name} secondary={describeAction(a)} />
                </ListItemButton>
              ) : (
                <ListItemText
                  sx={{ px: 2, py: 0.5 }}
                  primary={name}
                  secondary="No longer available to this routine. Remove it to save."
                  slotProps={{ secondary: { color: 'warning.main' } }}
                />
              )}
            </ListItem>
          )
        })}
      </List>
      <Button size="small" startIcon={<AddIcon />} onClick={() => setPicking(true)}>
        Add device
      </Button>
      {picking && (
        <DevicePickerDialog
          devices={devices.filter((d) => !used.has(d.id))}
          rooms={rooms}
          onClose={() => setPicking(false)}
          onPick={(device) => {
            setPicking(false)
            setEditing({ device, action: newAction(device.id) })
          }}
        />
      )}
      {editing && (
        <ActionDialog
          device={editing.device}
          action={editing.action}
          onClose={() => setEditing(null)}
          onSave={(action) => {
            onUpsert(fitDraftAction(action, editing.device))
            setEditing(null)
          }}
        />
      )}
    </>
  )
}
