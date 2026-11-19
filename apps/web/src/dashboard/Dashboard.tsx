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
import { HomeEmptyState } from './HomeEmptyState'
import { HomeWeatherStrip } from './HomeWeatherStrip'
import { ErrorSnackbar } from './ErrorSnackbar'
import { AddDeviceButton } from './layout/AddDeviceButton'
import { ArrangeBar } from './layout/ArrangeBar'
import { ArrangeGrid } from './layout/ArrangeGrid'
import { ConfirmResetDialog } from './layout/ConfirmResetDialog'
import { useArrange } from './layout/useArrange'
import { defaultWidgets } from './widgets/defaultWidgets'
import { AddWidgetButton } from './widgets/AddWidgetButton'
import { useWidgetData } from './widgets/useWidgetData'
import { dashboardView } from './lib/dashboardView'
import { devicesToAdd } from './lib/devicesToAdd'
import { devicesToTurnOff } from './lib/devicesToTurnOff'
import { ALL_DEVICES_NAME } from './lib/roomSummaries'
import { ALL_TAB, HOME_TAB } from './lib/roomTabs'
import { RoomHeader } from './RoomHeader'
import { RoutineRow } from './routines/RoutineRow'
import { useScrollMemory } from './useScrollMemory'

/**
 * One room (or `all`, or `home`): its name, routines, device grid and the error snackbar, wired to live
 * data. ⋯ / long-press open the details page (remembering this room for Back). "All off" switches off
 * everything on in the tab; "Arrange" switches it into arrange mode (drag, resize, save, reset). An
 * unknown room shows all. Home shows only what was placed on it, without the routine row.
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
  const isHome = tab === HOME_TAB
  const name = isHome ? 'Home' : tab === ALL_TAB ? ALL_DEVICES_NAME : (tabs.find((r) => r.id === tab)?.name ?? ALL_DEVICES_NAME)
  const widgetData = useWidgetData(devices, rooms)
  const { weather } = widgetData
  const arrange = useArrange(tab, tiles, setError, defaultWidgets(tab, weather), { appendUnplaced: !isHome })
  const shown = arrange.tiles.flatMap((t) => ('device' in t ? [t.device] : []))
  const hasContent = isHome ? arrange.tiles.length > 0 : tiles.length > 0
  // Home is only what was placed on it, so it waits for the saved layout rather than showing itself empty.
  const homeWaiting = isHome && !arrange.layoutsLoaded && !arrange.layoutsFailed
  const firstLoad = (loading && devices.length === 0) || homeWaiting
  const homeFailed = isHome && arrange.layoutsFailed
  useScrollMemory(pathname, !firstLoad && hasContent)

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 1800, mx: 'auto' }}>
      {!firstLoad && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <RoomHeader name={name} showBack={showBack} />
          {shown.length > 0 && !arrange.arranging && (
            <AllOffButton disabled={devicesToTurnOff(shown).length === 0} onClick={() => void allOff(shown)} />
          )}
          {arrange.arranging && isHome && <AddDeviceButton groups={devicesToAdd(tiles, arrange.tiles, rooms)} onAdd={arrange.addDevice} />}
          {arrange.arranging && <AddWidgetButton data={widgetData} onAdd={arrange.addWidget} />}
          {(hasContent || arrange.arranging) && (
            <ArrangeBar
              startLabel={isHome ? 'Edit Home' : undefined}
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
      {!firstLoad && isHome && <HomeWeatherStrip tiles={arrange.tiles} />}
      {!firstLoad && !arrange.arranging && !isHome && <RoutineRow tab={tab} devices={devices} onError={setError} />}
      {firstLoad ? (
        <DeviceGridSkeleton />
      ) : !hasContent && !arrange.arranging ? (
        homeFailed ? (
          <EmptyState failed failedTitle="Couldn't load your Home." />
        ) : isHome && !loadError ? (
          <HomeEmptyState onAdd={arrange.start} />
        ) : (
          <EmptyState failed={Boolean(loadError)} />
        )
      ) : (
        <Box sx={{ mt: 2 }}>
          {arrange.arranging ? (
            <ArrangeGrid
              tiles={arrange.tiles}
              data={widgetData}
              onMove={arrange.move}
              onMoveBy={arrange.moveBy}
              onResize={arrange.resize}
              onRemove={arrange.removeEntry}
              devicesRemovable={isHome}
            />
          ) : (
            <DeviceGrid tiles={arrange.tiles} data={widgetData} isAdmin={isAdmin} onToggle={toggle} onOpenDetails={(d) => navigate('/devices/' + d.id, { state: { from: pathname } })} />
          )}
        </Box>
      )}
      {arrange.confirmingReset && <ConfirmResetDialog onConfirm={arrange.reset} onClose={arrange.closeReset} />}
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  )
}
