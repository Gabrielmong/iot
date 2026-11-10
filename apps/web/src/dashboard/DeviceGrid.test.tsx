import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { deviceFixture } from '../test/deviceFixtures'
import { DeviceGrid } from './DeviceGrid'

describe('DeviceGrid', () => {
  it('spans a 2×2 card over two columns and two rows', () => {
    const big = deviceFixture({ id: 'big', name: 'Big plug', kind: 'PLUG' })
    const small = deviceFixture({ id: 'small', name: 'Small plug', kind: 'PLUG' })
    render(
      <MemoryRouter>
        <DeviceGrid
          tiles={[
            { device: big, size: 'L2x2' },
            { device: small, size: 'S1x1' },
          ]}
          isAdmin={false}
          onToggle={vi.fn()}
          onOpenDetails={vi.fn()}
        />
      </MemoryRouter>,
    )
    const cell = (name: string) => screen.getByRole('button', { name }).closest('[data-tile-size]') as HTMLElement
    expect(cell('Big plug').style.gridColumn).toBe('span 2')
    expect(cell('Big plug').style.gridRow).toBe('span 2')
    expect(cell('Small plug').style.gridColumn).toBe('span 1')
  })
})
