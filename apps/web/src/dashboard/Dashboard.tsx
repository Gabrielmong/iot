import Box from '@mui/material/Box'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AllOffButton } from './AllOffButton'
import { useAllOff } from './data/useAllOff'
import { useDevices } from './data/useDevices'
import { useRooms } from './data/useRooms'
import { useSetDeviceState } from './data/useSetDeviceState'
import { useToggleDevice } from './data/useToggleDevice'
import { DeviceGrid } from './DeviceGrid'
import { DeviceGridSkeleton } from './DeviceGridSkeleton'
import { EmptyState } from './EmptyState'
import { ErrorSnackbar } from './ErrorSnackbar'
import { ArrangeBar } from './layout/ArrangeBar'
import { ArrangeGrid } from './layout/ArrangeGrid'
import { ConfirmResetDialog } from './layout/ConfirmResetDialog'
import { useArrange } from './layout/useArrange'
import { dashboardView } from './lib/dashboardView'
import { devicesToTurnOff } from './lib/devicesToTurnOff'
import { ALL_DEVICES_NAME } from './lib/roomSummaries'
import { ALL_TAB } from './lib/roomTabs'
import { RoomHeader } from './RoomHeader'
import { RoutineRow } from './routines/RoutineRow'
import { useScrollMemory } from './useScrollMemory'

/**
 * One room (or `all`): its name, routines, device grid and the error snackbar, wired to live data. ⋯ /
 * long-press open the details page (remembering this room for Back). "All off" switches off everything on
 * in the room; "Arrange" switches it into arrange mode (drag, resize, save, reset). An unknown room shows all.
 */
export function Dashboard({ isAdmin, room, showBack = false }: { isAdmin: boolean; room: string; showBack?: boolean }) {
  const { devices, loading, error: loadError } = useDevices()
  const rooms = useRooms()
  const [error, setError] = useState<string | null>(null)
  const setState = useSetDeviceState(setError)
  const toggle = useToggleDevice(setState)
  const allOff = useAllOff(setState)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const { tabs, tab, tiles } = dashboardView(devices, rooms, room)
  const name = tab === ALL_TAB ? ALL_DEVICES_NAME : (tabs.find((r) => r.id === tab)?.name ?? ALL_DEVICES_NAME)
  const arrange = useArrange(tab, tiles, setError)
  const firstLoad = loading && devices.length === 0
  useScrollMemory(pathname, !firstLoad && tiles.length > 0)

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 1800, mx: 'auto' }}>
      {!firstLoad && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <RoomHeader name={name} showBack={showBack} />
          {tiles.length > 0 && !arrange.arranging && (
            <AllOffButton disabled={devicesToTurnOff(tiles).length === 0} onClick={() => void allOff(tiles)} />
          )}
          {(tiles.length > 0 || arrange.arranging) && (
            <ArrangeBar
              arranging={arrange.arranging}
              isAdmin={isAdmin}
              canReset={arrange.canReset}
              busy={arrange.busy}
              onStart={arrange.start}
              onCancel={arrange.cancel}
              onSave={(asDefault) => void arrange.save(asDefault)}
              onReset={arrange.askReset}
            />
          )}
        </Box>
      )}
      {!firstLoad && !arrange.arranging && <RoutineRow tab={tab} devices={devices} onError={setError} />}
      {firstLoad ? (
        <DeviceGridSkeleton />
      ) : tiles.length === 0 ? (
        <EmptyState failed={Boolean(loadError)} />
      ) : (
        <Box sx={{ mt: 2 }}>
          {arrange.arranging ? (
            <ArrangeGrid tiles={arrange.tiles} onMove={arrange.move} onMoveBy={arrange.moveBy} onResize={arrange.resize} />
          ) : (
            <DeviceGrid tiles={arrange.tiles} isAdmin={isAdmin} onToggle={toggle} onOpenDetails={(d) => navigate('/devices/' + d.id, { state: { from: pathname } })} />
          )}
        </Box>
      )}
      {arrange.confirmingReset && <ConfirmResetDialog onConfirm={arrange.reset} onClose={arrange.closeReset} />}
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  )
}
