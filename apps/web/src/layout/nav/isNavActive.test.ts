import { isNavActive } from './isNavActive'

describe('isNavActive', () => {
  const dashboard = { to: '/', exact: true, alsoActive: ['/devices/'] }
  const routines = { to: '/routines' }

  it('matches the dashboard only at the root or on a device page', () => {
    expect(isNavActive(dashboard, '/')).toBe(true)
    expect(isNavActive(dashboard, '/devices/abc')).toBe(true)
    expect(isNavActive(dashboard, '/routines')).toBe(false)
  })

  it('matches a section and its sub-pages but not look-alike paths', () => {
    expect(isNavActive(routines, '/routines')).toBe(true)
    expect(isNavActive(routines, '/routines/new')).toBe(true)
    expect(isNavActive(routines, '/routinesx')).toBe(false)
  })
})
