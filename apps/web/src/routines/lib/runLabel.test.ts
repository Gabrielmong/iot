import { runFixture } from '../../test/routineFixtures'
import { problemText, runLabel } from './runLabel'

describe('runLabel', () => {
  it('maps statuses to an icon and text', () => {
    expect(runLabel(null)).toEqual({ icon: null, text: '' })
    expect(runLabel(runFixture('RUNNING'))).toEqual({ icon: 'running', text: 'Running…' })
    expect(runLabel(runFixture('OK'))).toEqual({ icon: 'ok', text: 'Done' })
    expect(runLabel(runFixture('PARTIAL'))).toEqual({ icon: 'warn', text: 'Some devices had problems' })
    expect(runLabel(runFixture('FAILED'))).toEqual({ icon: 'warn', text: "Didn't work" })
    expect(runLabel(runFixture('INTERRUPTED'))).toEqual({ icon: 'warn', text: 'Interrupted by a server restart' })
    expect(runLabel(runFixture('STOPPED'))).toEqual({ icon: null, text: 'Stopped' })
  })

  it('describes each problem reason', () => {
    expect(problemText({ deviceName: 'Lamp', reason: 'UNREACHABLE' })).toBe("Lamp: couldn't reach it")
    expect(problemText({ deviceName: 'Lamp', reason: 'NOT_READY' })).toBe('Lamp: needs setup')
    expect(problemText({ deviceName: 'Lamp', reason: 'NO_ACCESS' })).toBe('Lamp: no access')
    expect(problemText({ deviceName: 'Removed device', reason: 'REMOVED' })).toBe('Removed device: removed')
  })
})
