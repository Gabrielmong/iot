import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { deviceFixture } from '../../test/deviceFixtures'
import type { Device } from '../types'
import { OfflineWidget } from './OfflineWidget'

const offline = (id: string, name: string): Device => {
  const d = deviceFixture({ id, name, kind: 'PLUG' })
  return { ...d, state: { ...d.state, online: false } }
}

const renderWidget = (devices: Device[]) =>
  render(
    <MemoryRouter>
      <OfflineWidget devices={devices} size="S1x1" />
    </MemoryRouter>,
  )

describe('OfflineWidget', () => {
  it('says all is well when everything responds', () => {
    renderWidget([deviceFixture({ id: 'a', name: 'Lamp' })])
    expect(screen.getByText('All devices online')).toBeInTheDocument()
  })

  it('counts the offline devices and lists them in a dialog linking to each', () => {
    renderWidget([offline('k', 'Kettle'), offline('f', 'Fan'), offline('t', 'Toaster')])
    fireEvent.click(screen.getByRole('button', { name: '3 devices offline' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Devices offline' }))
    expect(dialog.getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Fan', '/devices/f'],
      ['Kettle', '/devices/k'],
      ['Toaster', '/devices/t'],
    ])
  })

  it('says one device in the singular', () => {
    renderWidget([offline('k', 'Kettle')])
    expect(screen.getByRole('button', { name: '1 device offline' })).toBeInTheDocument()
  })
})
