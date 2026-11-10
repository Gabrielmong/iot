import { adminDeviceFixture, roomFixture } from '../../test/adminFixtures'
import { DEFAULT_SORT, filterDevices, NO_FILTERS, sortDevices } from './deviceQuery'

const rancho = roomFixture('r1', 'Rancho', 1)
const sala = roomFixture('r2', 'Sala 2', 2)
const pepe = adminDeviceFixture({ id: 'pepe', name: 'Cámara Pepe', kind: 'CAMERA', model: 'Nexxt', room: rancho, lastSeenAt: '2026-11-07T10:00:00Z' })
const lamp = adminDeviceFixture({ id: 'lamp', name: 'Lamp', kind: 'LIGHT', ip: '192.168.0.5', room: sala, lastSeenAt: '2026-11-07T12:00:00Z' })
const plug = adminDeviceFixture({ id: 'plug', name: 'Kettle', kind: 'PLUG', online: false, room: null, lastSeenAt: null })
const fan = adminDeviceFixture({ id: 'fan', name: 'Fan', kind: 'PLUG', room: rancho, status: 'NEEDS_KEY' })
const all = [pepe, lamp, plug, fan]
const ids = (list: { id: string }[]) => list.map((d) => d.id)

describe('filterDevices', () => {
  it('keeps everything with no filters', () => {
    expect(ids(filterDevices(all, NO_FILTERS))).toEqual(['pepe', 'lamp', 'plug', 'fan'])
  })

  it('searches name, model, address and room, ignoring case', () => {
    expect(ids(filterDevices(all, { ...NO_FILTERS, search: 'pepe' }))).toEqual(['pepe'])
    expect(ids(filterDevices(all, { ...NO_FILTERS, search: 'NEXXT' }))).toEqual(['pepe'])
    expect(ids(filterDevices(all, { ...NO_FILTERS, search: '0.5' }))).toEqual(['lamp'])
    expect(ids(filterDevices(all, { ...NO_FILTERS, search: 'rancho' }))).toEqual(['pepe', 'fan'])
  })

  it('filters by room, including no room', () => {
    expect(ids(filterDevices(all, { ...NO_FILTERS, room: 'r1' }))).toEqual(['pepe', 'fan'])
    expect(ids(filterDevices(all, { ...NO_FILTERS, room: 'none' }))).toEqual(['plug'])
  })

  it('filters by kind and health', () => {
    expect(ids(filterDevices(all, { ...NO_FILTERS, kind: 'PLUG' }))).toEqual(['plug', 'fan'])
    expect(ids(filterDevices(all, { ...NO_FILTERS, health: 'offline' }))).toEqual(['plug'])
    expect(ids(filterDevices(all, { ...NO_FILTERS, health: 'setup' }))).toEqual(['fan'])
  })
})

describe('sortDevices', () => {
  it('sorts by room then name by default, with no room last', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'room', dir: 'asc' })
    expect(ids(sortDevices(all, DEFAULT_SORT))).toEqual(['pepe', 'fan', 'lamp', 'plug'])
  })

  it('reverses direction', () => {
    expect(ids(sortDevices(all, { key: 'name', dir: 'asc' }))).toEqual(['pepe', 'fan', 'plug', 'lamp'])
    expect(ids(sortDevices(all, { key: 'name', dir: 'desc' }))).toEqual(['lamp', 'plug', 'fan', 'pepe'])
  })

  it('puts the most recently seen first, never-seen last', () => {
    expect(ids(sortDevices(all, { key: 'lastSeen', dir: 'asc' }))).toEqual(['lamp', 'pepe', 'plug', 'fan'])
  })
})
