import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useDevices } from '../dashboard/data/useDevices'
import { ErrorSnackbar } from '../dashboard/ErrorSnackbar'
import { isCamera } from '../dashboard/lib/capabilities'
import { useCameraGroups } from './data/useCameraGroups'
import { CameraGrid } from './grid/CameraGrid'
import { GroupActions } from './groups/GroupActions'
import { initialSelection, selectGroup, toggleCamera, visibleSelection, type Selection } from './lib/selection'
import { CameraPanel } from './panel/CameraPanel'
import { PanelDrawer } from './panel/PanelDrawer'

/**
 * What the viewer chose: an explicit selection (after ticking cameras or changing the layout), or a
 * group to follow, so the view keeps up when that group is saved or changes elsewhere.
 */
type Picked = Selection | { follow: string; fallback: Selection }

/**
 * The multi-view page body: the groups/cameras panel (a drawer on small screens), group actions and the
 * grid. Until the viewer picks something it follows `initialSelection`, so it opens on their first group.
 */
export function CamerasView({ isAdmin }: { isAdmin: boolean }) {
  const { devices, loading } = useDevices()
  const groups = useCameraGroups(isAdmin)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const allGroups = [...groups.mine, ...groups.shared, ...groups.others]
  const followed = picked && 'follow' in picked ? allGroups.find((g) => g.id === picked.follow) : undefined
  // A followed group missing from the list (just saved, or deleted elsewhere) keeps the view as it was.
  const selection = followed ? selectGroup(followed) : picked ? ('follow' in picked ? picked.fallback : picked) : initialSelection(groups)
  const cameras = devices.filter(isCamera)
  const byId = new Map(cameras.map((c) => [c.id, c]))
  const visibleIds = new Set(byId.keys())
  const shown = visibleSelection(selection, visibleIds).map((id) => byId.get(id)!)
  const group = allGroups.find((g) => g.id === selection.groupId) ?? null
  // Saving works on what the viewer can see, so a camera they lost access to is dropped, not sent.
  const highlighted = group && { ...group, cameraIds: group.cameraIds.filter((id) => visibleIds.has(id)) }
  const follow = (id: string) => setPicked({ follow: id, fallback: selection })

  const panel = (
    <CameraPanel
      groups={groups}
      cameras={cameras}
      selection={selection}
      onSelectGroup={(g) => follow(g.id)}
      onToggleCamera={(id) => setPicked(toggleCamera(selection, id))}
    />
  )

  if (!loading && cameras.length === 0) return <Message>You don&apos;t have any cameras yet.</Message>

  return (
    <Box sx={{ display: 'flex', gap: 2, p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 1800, mx: 'auto', alignItems: 'flex-start' }}>
      <Paper variant="outlined" sx={{ display: { xs: 'none', md: 'block' }, width: 260, flexShrink: 0, position: 'sticky', top: 16 }}>
        {panel}
      </Paper>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: { md: 'none' } }}>
          <PanelDrawer>{panel}</PanelDrawer>
        </Box>
        <GroupActions
          selection={{ ...selection, cameraIds: shown.map((c) => c.id) }}
          group={highlighted}
          isAdmin={isAdmin}
          cameraNames={new Map(cameras.map((c) => [c.id, c.name]))}
          onSaved={follow}
          onDeleted={() => setPicked({ ...selection, groupId: null })}
          onError={setError}
        />
        <CameraGrid
          cameras={shown}
          layout={selection.layout}
          onLayout={(layout) => setPicked({ ...selection, layout })}
          empty={selection.groupId ? 'No cameras you can see' : 'Pick cameras or a group'}
        />
      </Box>
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ p: 3, color: 'text.secondary' }}>{children}</Typography>
}
