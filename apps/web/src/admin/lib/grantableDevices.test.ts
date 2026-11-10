import { grantableDevices } from './grantableDevices'

const d = (id: string, adopted: boolean, parentId: string | null = null) => ({ id, adopted, parentId })

describe('grantableDevices', () => {
  it('drops un-adopted devices and strips whose outlets are listed', () => {
    const list = [d('strip', true), d('o1', true, 'strip'), d('lamp', true), d('new', false)]
    expect(grantableDevices(list).map((x) => x.id)).toEqual(['o1', 'lamp'])
  })
})
