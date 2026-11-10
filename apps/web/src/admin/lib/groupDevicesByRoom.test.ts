import { groupDevicesByRoom } from './groupDevicesByRoom'

const room = (id: string, name: string) => ({ id, name })
const dev = (id: string, r: ReturnType<typeof room> | null) => ({ id, room: r })

describe('groupDevicesByRoom', () => {
  it('orders rooms as given, omits empty rooms, and puts "No room" last', () => {
    const kitchen = room('k', 'Kitchen')
    const hall = room('h', 'Hall')
    const groups = groupDevicesByRoom([dev('1', null), dev('2', hall), dev('3', kitchen), dev('4', hall)], [
      { id: 'k' },
      { id: 'x' },
      { id: 'h' },
    ])
    expect(groups.map((g) => [g.name, g.devices.map((d) => d.id)])).toEqual([
      ['Kitchen', ['3']],
      ['Hall', ['2', '4']],
      ['No room', ['1']],
    ])
  })

  it('returns nothing for no devices', () => {
    expect(groupDevicesByRoom([], [])).toEqual([])
  })
})
