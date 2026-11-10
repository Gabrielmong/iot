import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { useRooms } from '../dashboard/data/useRooms'
import { PageSection } from './common/PageSection'
import { QueryError } from './common/QueryError'
import { useAdminDevices } from './data/useAdminDevices'
import { useIntegrations } from './data/useIntegrations'
import { DeviceDialogs, type DeviceDialogState } from './devices/DeviceDialogs'
import { DeviceMenu } from './devices/DeviceMenu'
import { DevicesToolbar } from './devices/DevicesToolbar'
import { KasaHint } from './devices/KasaHint'
import { NewDevicesStrip } from './devices/NewDevicesStrip'
import { TestControl } from './devices/TestControl'
import { useDeviceQueryState } from './devices/useDeviceQueryState'
import { YourDevices } from './devices/YourDevices'
import { filterDevices, sortDevices } from './lib/deviceQuery'
import { healthCounts } from './lib/deviceStatus'

/** Admin devices: new devices to test and adopt, then the adopted ones as a searchable, sortable table. */
export function DevicesPage() {
  const { devices, loading, error, hasData, retry } = useAdminDevices()
  const rooms = useRooms()
  const integrations = useIntegrations()
  const [dialog, setDialog] = useState<DeviceDialogState>(null)
  const query = useDeviceQueryState()

  if (error && !hasData) return <QueryError what="devices" onRetry={retry} />
  if (loading && devices.length === 0) return <CircularProgress aria-label="Loading devices" />

  const fresh = devices.filter((d) => !d.adopted)
  const mine = devices.filter((d) => d.adopted)
  const shown = sortDevices(filterDevices(mine, query.filters), query.sort)
  const showKasaHint = integrations !== null && !integrations.kasaConfigured && !devices.some((d) => d.brand === 'KASA')

  return (
    <>
      {showKasaHint && <KasaHint />}
      <NewDevicesStrip
        devices={fresh}
        onAdopt={(device) => setDialog({ type: 'adopt', device })}
        renderTest={(device) => <TestControl device={device} />}
      />
      <PageSection title="Your devices">
        <DevicesToolbar
          filters={query.filters}
          onFilters={query.updateFilters}
          rooms={rooms}
          counts={healthCounts(mine)}
          actions={
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button onClick={() => setDialog({ type: 'addComputer' })}>Add PC</Button>
              <Button onClick={() => setDialog({ type: 'addTv' })}>Add TV</Button>
              <Button onClick={() => setDialog({ type: 'kasa' })}>Add Kasa by IP</Button>
            </Stack>
          }
        />
        <YourDevices
          devices={shown}
          sort={query.sort}
          onSort={query.toggleSort}
          onClearFilters={query.clearFilters}
          renderAction={(device) => <DeviceMenu device={device} onAction={(type) => setDialog({ type, device })} />}
        />
      </PageSection>
      <DeviceDialogs state={dialog} devices={devices} rooms={rooms} onClose={() => setDialog(null)} />
    </>
  )
}
