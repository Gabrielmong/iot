import Box from '@mui/material/Box'
import type { Device } from '../../dashboard/types'
import type { Selection } from '../lib/selection'
import type { CameraGroup } from '../types'
import { CameraChecklist } from './CameraChecklist'
import { GroupList } from './GroupList'

type Props = {
  groups: { mine: readonly CameraGroup[]; shared: readonly CameraGroup[]; others: readonly CameraGroup[] }
  cameras: readonly Device[]
  selection: Selection
  onSelectGroup: (group: CameraGroup) => void
  onToggleCamera: (id: string) => void
}

/** Saved groups (mine, shared, and for admins other users'), then every camera with a checkbox. */
export function CameraPanel({ groups, cameras, selection, onSelectGroup, onToggleCamera }: Props) {
  return (
    <Box sx={{ py: 1 }}>
      <GroupList title="My groups" groups={groups.mine} selectedId={selection.groupId} onSelect={onSelectGroup} />
      <GroupList title="Shared" groups={groups.shared} selectedId={selection.groupId} onSelect={onSelectGroup} />
      <GroupList title="Other users" groups={groups.others} selectedId={selection.groupId} onSelect={onSelectGroup} collapsible />
      <CameraChecklist cameras={cameras} checked={selection.cameraIds} onToggle={onToggleCamera} />
    </Box>
  )
}
