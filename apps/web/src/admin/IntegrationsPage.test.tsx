import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { of } from 'rxjs'
import { adminDeviceFixture, roomFixture } from '../test/adminFixtures'
import { createTestClient, failWith, type Handler, reply } from '../test/testClient'
import { IntegrationsPage } from './IntegrationsPage'

type Status = { tuyaCloudConfigured: boolean; kasaConfigured: boolean; swannConfigured: boolean; tuyaLastSyncAt?: string | null }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function setup(path: string, status: Partial<Status> = {}, extra: Record<string, Handler> = {}) {
  const client = createTestClient({
    Integrations: reply({
      integrations: {
        __typename: 'IntegrationStatus',
        tuyaCloudConfigured: true,
        kasaConfigured: false,
        swannConfigured: false,
        tuyaLastSyncAt: null,
        kasaLastSavedAt: null,
        swannLastSyncAt: null,
        ...status,
      },
    }),
    AdminDevices: reply({
      adminDevices: [
        adminDeviceFixture({ id: 'lamp', name: 'Lamp', brand: 'TUYA', adopted: true, room: roomFixture('r1', 'Rancho', 1) }),
        adminDeviceFixture({ id: 'new', name: 'New bulb', brand: 'TUYA', adopted: false }),
        adminDeviceFixture({ id: 'kettle', name: 'Kettle', brand: 'KASA', adopted: true }),
      ],
    }),
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/integrations" element={<IntegrationsPage />} />
          <Route path="/admin/integrations/:integration" element={<IntegrationsPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ApolloProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent

describe('IntegrationsPage', () => {
  it('opens the first integration that is not set up yet', async () => {
    setup('/admin/integrations')
    expect(await screen.findByLabelText('TP-Link password')).toHaveAttribute('type', 'password')
    expect(where()).toBe('/admin/integrations/kasa')
    expect(screen.getByRole('tab', { name: /TP-Link \(Kasa\)/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Kasa devices appear only after you save your TP-Link credentials/)).toBeInTheDocument()
  })

  it('opens a bookmarked integration directly', async () => {
    setup('/admin/integrations/swann')
    expect(await screen.findByRole('tab', { name: /Swann recorder/ })).toHaveAttribute('aria-selected', 'true')
    expect(where()).toBe('/admin/integrations/swann')
  })

  it('redirects an unknown integration', async () => {
    setup('/admin/integrations/xyz', { kasaConfigured: true, swannConfigured: true })
    await screen.findByRole('tab', { name: /Tuya cloud/, selected: true })
    expect(where()).toBe('/admin/integrations/tuya')
  })

  it('shows when it last synced', async () => {
    setup('/admin/integrations/tuya', { tuyaLastSyncAt: new Date(Date.now() - 5 * 60_000).toISOString() })
    expect(await screen.findByText('Last synced: 5 min ago')).toBeInTheDocument()
  })

  it('says Never when it has not synced', async () => {
    setup('/admin/integrations/swann')
    expect(await screen.findByText('Last synced: Never')).toBeInTheDocument()
  })

  it("lists only that integration's adopted devices, linking to them", async () => {
    setup('/admin/integrations/tuya')
    const list = within(await screen.findByRole('region', { name: 'Devices using it' }))
    expect(await list.findByRole('link', { name: /Lamp/ })).toHaveAttribute('href', '/devices/lamp')
    expect(list.queryByText(/New bulb/)).not.toBeInTheDocument()
    expect(list.queryByText(/Kettle/)).not.toBeInTheDocument()
  })

  it('says when no devices use an integration', async () => {
    setup('/admin/integrations/swann')
    expect(await screen.findByText('No devices use this yet.')).toBeInTheDocument()
  })

  it('shows the sync result and lists unmatched devices', async () => {
    setup('/admin/integrations/tuya', {}, { SyncTuyaKeys: reply({ syncTuyaKeys: { __typename: 'SyncResult', matched: 14, unmatched: ['x'], found: [] } }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Sync keys from Tuya' }))
    expect(await screen.findByText('14 devices updated')).toBeInTheDocument()
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText(/weren't seen on the network/)).toBeInTheDocument()
  })

  it('lists devices the sync found on the network without a broadcast', async () => {
    setup('/admin/integrations/tuya', {}, { SyncTuyaKeys: reply({ syncTuyaKeys: { __typename: 'SyncResult', matched: 2, unmatched: [], found: ['My lamp'] } }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Sync keys from Tuya' }))
    expect(await screen.findByText('My lamp')).toBeInTheDocument()
    expect(screen.getByText(/Found on your network/)).toBeInTheDocument()
    expect(screen.queryByText(/weren't seen on the network/)).not.toBeInTheDocument()
  })

  it('maps Tuya cloud auth failures to friendly text', async () => {
    setup('/admin/integrations/tuya', {}, { SyncTuyaKeys: failWith('TUYA_CLOUD_AUTH') })
    fireEvent.click(await screen.findByRole('button', { name: 'Sync keys from Tuya' }))
    expect(await screen.findByText(/rejected that Access ID or Secret/)).toBeInTheDocument()
  })

  it('keeps the Tuya secret input empty and masked', async () => {
    setup('/admin/integrations/tuya')
    expect(await screen.findByLabelText('Access Secret')).toHaveValue('')
    expect(screen.getByLabelText('Access Secret')).toHaveAttribute('type', 'password')
  })

  it('updates Last synced after a key sync', async () => {
    let synced: string | null = null
    setup('/admin/integrations/tuya', {}, {
      SyncTuyaKeys: (op) => {
        synced = new Date().toISOString()
        return reply({ syncTuyaKeys: { __typename: 'SyncResult', matched: 1, unmatched: [], found: [] } })(op)
      },
      Integrations: () =>
        of({
          data: {
            integrations: {
              __typename: 'IntegrationStatus',
              tuyaCloudConfigured: true,
              kasaConfigured: false,
              swannConfigured: false,
              tuyaLastSyncAt: synced,
              kasaLastSavedAt: null,
              swannLastSyncAt: null,
            },
          },
        }),
    })
    expect(await screen.findByText('Last synced: Never')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sync keys from Tuya' }))
    expect(await screen.findByText('Last synced: Just now')).toBeInTheDocument()
  })

  it('shows an error with Retry when integrations cannot be loaded', async () => {
    setup('/admin/integrations/tuya', {}, { Integrations: failWith('INTERNAL_SERVER_ERROR') })
    expect(await screen.findByText("Couldn't load integrations.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
