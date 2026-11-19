import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { of, Subject } from 'rxjs'
import type { DeviceFieldsFragment } from '../../gql/graphql'
import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { createTestClient, failWith, type Handler, liveSubscription, reply } from '../../test/testClient'
import { routineHandlers } from '../../test/routineFixtures'
import { emptyWeather, weatherFixture } from '../../test/weatherFixtures'
import { Dashboard } from '../Dashboard'

const living = { id: 'r1', name: 'Living room', sortOrder: 1 }
const lamp = lightFixture({ brightness: 70 }, { id: 'lamp', name: 'Desk lamp', room: living })
const kitchen = { id: 'r2', name: 'Kitchen', sortOrder: 2 }
const kettle = deviceFixture({ id: 'kettle', name: 'Kettle', kind: 'PLUG', on: false, room: living })
const toaster = deviceFixture({ id: 'toaster', name: 'Toaster', kind: 'PLUG', on: false, room: kitchen })

type Calls = { save: unknown[]; reset: unknown[]; setState: unknown[] }

type Opts = { isAdmin?: boolean; devices?: DeviceFieldsFragment[]; extra?: Record<string, Handler>; isDefault?: boolean; room?: string; items?: unknown[] }

function setup(opts: Opts = {}) {
  const calls: Calls = { save: [], reset: [], setState: [] }
  const deviceState = liveSubscription()
  const devicesChanged = liveSubscription()
  let devices = opts.devices ?? [lamp, kettle]
  const layout = { __typename: 'DashboardLayout', tab: 'all', isDefault: opts.isDefault ?? false, items: opts.items ?? [] }
  const client = createTestClient({
    Devices: () => of({ data: { devices } }),
    Rooms: reply({ rooms: [living, kitchen].map((r) => ({ __typename: 'Room', ...r })) }),
    DeviceState: deviceState.handler,
    DevicesChanged: devicesChanged.handler,
    DashboardLayouts: reply({ dashboardLayouts: [layout] }),
    ...routineHandlers(),
    Weather: reply({ weather: emptyWeather('NOT_CONFIGURED') }),
    WeatherUpdated: liveSubscription().handler,
    SetDeviceState: (op) => {
      calls.setState.push(op.variables)
      return of({ data: { setDeviceState: lamp } })
    },
    SaveDashboardLayout: (op) => {
      calls.save.push(op.variables)
      return of({ data: { saveDashboardLayout: { ...layout, items: [] } } })
    },
    ResetDashboardLayout: (op) => {
      calls.reset.push(op.variables)
      return of({ data: { resetDashboardLayout: null } })
    },
    ...opts.extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <Dashboard isAdmin={opts.isAdmin ?? false} room={opts.room ?? 'all'} />
      </MemoryRouter>
    </ApolloProvider>,
  )
  /** Replaces the device list and fires devicesChanged so the dashboard refetches it. */
  const changeDevices = async (next: DeviceFieldsFragment[]) => {
    devices = next
    await act(async () => devicesChanged.next({ devicesChanged: true }))
  }
  return { calls, deviceState, changeDevices }
}

async function startArranging() {
  fireEvent.click(await screen.findByRole('button', { name: 'Arrange' }))
}

const sizeOf = (name: string, label: string) =>
  within(screen.getByRole('radiogroup', { name: `Card size for ${name}` })).getByRole('radio', { name: label })

describe('Arrange mode', () => {
  it('blocks taps on tiles while arranging', async () => {
    const { calls } = setup()
    await startArranging()
    fireEvent.click(screen.getByRole('button', { name: 'Move Desk lamp' }))
    expect(calls.setState).toEqual([])
  })

  it('resizes a card and saves the tab', async () => {
    const { calls } = setup()
    await startArranging()
    fireEvent.click(sizeOf('Desk lamp', '2×2'))
    expect(sizeOf('Desk lamp', '2×2')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(calls.save).toEqual([
        {
          tab: 'all',
          items: [
            { deviceId: 'lamp', size: 'L2x2' },
            { deviceId: 'kettle', size: 'S1x1' },
          ],
          asDefault: false,
        },
      ]),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Arrange' })).toBeInTheDocument())
  })

  it('reorders with the keyboard', async () => {
    const { calls } = setup()
    await startArranging()
    const handle = screen.getByRole('button', { name: 'Move Kettle' })
    fireEvent.keyDown(handle, { key: ' ' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    fireEvent.keyDown(handle, { key: ' ' })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(calls.save).toHaveLength(1))
    expect((calls.save[0] as { items: { deviceId: string }[] }).items.map((i) => i.deviceId)).toEqual(['kettle', 'lamp'])
  })

  it('keeps the draft and shows an error when saving fails', async () => {
    setup({ extra: { SaveDashboardLayout: failWith('BAD_USER_INPUT') } })
    await startArranging()
    fireEvent.click(sizeOf('Kettle', '2×1'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText("Couldn't save the layout.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(sizeOf('Kettle', '2×1')).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the draft when devices update live', async () => {
    const { deviceState } = setup()
    await startArranging()
    fireEvent.click(sizeOf('Desk lamp', '1×2'))
    act(() => deviceState.next({ deviceState: { ...kettle, state: { ...kettle.state, on: true } } }))
    expect(sizeOf('Desk lamp', '1×2')).toHaveAttribute('aria-checked', 'true')
  })

  it('admins choose Save as default for everyone', async () => {
    const { calls } = setup({ isAdmin: true })
    await startArranging()
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save for me' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save as default for everyone' }))
    await waitFor(() => expect(calls.save).toHaveLength(1))
    expect(calls.save[0]).toMatchObject({ tab: 'all', asDefault: true })
  })

  it('reset asks first, then resets the tab', async () => {
    const { calls } = setup()
    await startArranging()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(calls.reset).toEqual([])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to default' }))
    await waitFor(() => expect(calls.reset).toEqual([{ tab: 'all' }]))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Arrange' })).toBeInTheDocument())
  })

  it('hides Reset to default when the tab already shows the default', async () => {
    setup({ isDefault: true })
    await startArranging()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument()
  })

  it('Cancel discards the draft', async () => {
    const { calls } = setup()
    await startArranging()
    fireEvent.click(sizeOf('Kettle', '2×2'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('radiogroup', { name: 'Card size for Kettle' })).not.toBeInTheDocument()
    expect(calls.save).toEqual([])
    await startArranging()
    expect(sizeOf('Kettle', '1×1')).toHaveAttribute('aria-checked', 'true')
  })

  it('resizes a device that appeared while arranging', async () => {
    const { changeDevices } = setup({ devices: [lamp] })
    await startArranging()
    await changeDevices([lamp, kettle])
    await screen.findByRole('radiogroup', { name: 'Card size for Kettle' })
    fireEvent.click(sizeOf('Kettle', '2×2'))
    expect(sizeOf('Kettle', '2×2')).toHaveAttribute('aria-checked', 'true')
  })

  it('stops arranging quietly when the arranged room disappears', async () => {
    const { calls, changeDevices } = setup({ devices: [lamp, toaster], room: 'r2' })
    await startArranging()
    await changeDevices([lamp, { ...toaster, room: living }])
    expect(await screen.findByRole('button', { name: 'Arrange' })).toBeInTheDocument()
    expect(calls.save).toEqual([])
  })

  it('waits for the saved layout before leaving arrange mode', async () => {
    const refetch = new Subject<{ data: Record<string, unknown> }>()
    let firstLoad = true
    setup({
      extra: {
        DashboardLayouts: () => {
          if (!firstLoad) return refetch
          firstLoad = false
          return of({ data: { dashboardLayouts: [] } })
        },
      },
    })
    await startArranging()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('button', { name: 'Arrange' })).not.toBeInTheDocument()
    const items = [
      { __typename: 'LayoutItem', deviceId: 'kettle', size: 'S1x1' },
      { __typename: 'LayoutItem', deviceId: 'lamp', size: 'S1x1' },
    ]
    await act(async () => {
      refetch.next({ data: { dashboardLayouts: [{ __typename: 'DashboardLayout', tab: 'all', isDefault: false, items }] } })
      refetch.complete()
    })
    expect(await screen.findByRole('button', { name: 'Arrange' })).toBeInTheDocument()
  })

  it('drops a lifted card when focus leaves it', async () => {
    setup()
    await startArranging()
    const handle = screen.getByRole('button', { name: 'Move Kettle' })
    fireEvent.keyDown(handle, { key: ' ' })
    expect(handle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.blur(handle)
    expect(handle).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps Cancel available when every device disappears while arranging', async () => {
    const { changeDevices } = setup()
    await startArranging()
    await changeDevices([])
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    for (const tab of screen.queryAllByRole('tab')) expect(tab).not.toBeDisabled()
  })
})

const weatherIs = (weather: unknown) => ({ Weather: reply({ weather }) })
const lampItem = { __typename: 'LayoutItem', deviceId: 'lamp', widget: null, size: 'S1x1' }
const weatherItem = { __typename: 'LayoutItem', deviceId: null, widget: 'WEATHER', size: 'W2x1' }
const firstSave = (calls: unknown[]) => (calls[0] as { items: unknown[] }).items

describe('Arrange mode widgets', () => {
  it('adds the weather widget first, wide, and saves it', async () => {
    const { calls } = setup({ extra: weatherIs(weatherFixture()) })
    await startArranging()
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Weather' }))
    expect(sizeOf('Weather widget', '2×1')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(calls.save).toHaveLength(1))
    expect(firstSave(calls.save)).toEqual([
      { widget: 'WEATHER', size: 'W2x1' },
      { deviceId: 'lamp', size: 'S1x1' },
      { deviceId: 'kettle', size: 'S1x1' },
    ])
  })

  it('offers only the widgets the tab does not have', async () => {
    setup({ items: [weatherItem], extra: weatherIs(weatherFixture()) })
    await startArranging()
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }))
    expect(await screen.findByRole('menuitem', { name: 'Sun' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Weather' })).not.toBeInTheDocument()
  })

  it('removes a widget, and the save leaves it out', async () => {
    const { calls } = setup({ items: [weatherItem, lampItem], extra: weatherIs(weatherFixture()) })
    await startArranging()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Weather widget' }))
    expect(screen.queryByRole('button', { name: 'Move Weather widget' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(calls.save).toHaveLength(1))
    expect(firstSave(calls.save)).toEqual([
      { deviceId: 'lamp', size: 'S1x1' },
      { deviceId: 'kettle', size: 'S1x1' },
    ])
  })

  it('hides a saved weather widget while weather is off, but keeps it when arranging and saving', async () => {
    const { calls } = setup({ items: [weatherItem, lampItem], extra: weatherIs(emptyWeather('DISABLED')) })
    expect(await screen.findByRole('button', { name: 'Desk lamp' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Weather widget' })).not.toBeInTheDocument()
    await startArranging()
    expect(screen.getByRole('button', { name: 'Move Weather widget' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(calls.save).toHaveLength(1))
    expect(firstSave(calls.save)).toContainEqual({ widget: 'WEATHER', size: 'W2x1' })
  })

  it('shows the weather widget first on All when nothing is saved and weather works', async () => {
    setup({ extra: { ...weatherIs(weatherFixture()), DashboardLayouts: reply({ dashboardLayouts: [] }) } })
    const widget = await screen.findByRole('button', { name: 'Weather widget' })
    expect(widget.closest('[data-tile-size]')).toHaveAttribute('data-tile-size', 'W2x1')
  })
})

