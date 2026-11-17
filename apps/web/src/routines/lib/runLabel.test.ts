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
    expect(problemText({ deviceName: 'Lamp', reason: 'UNREACHABLE', routineName: null })).toBe("Lamp: couldn't reach it")
    expect(problemText({ deviceName: 'Lamp', reason: 'NOT_READY', routineName: null })).toBe('Lamp: needs setup')
    expect(problemText({ deviceName: 'Lamp', reason: 'NO_ACCESS', routineName: null })).toBe('Lamp: no access')
    expect(problemText({ deviceName: 'Removed device', reason: 'REMOVED', routineName: null })).toBe('Removed device: removed')
  })
})

describe('problemText in called routines', () => {
  it('names the called routine a device problem came from', () => {
    expect(problemText({ deviceName: 'Lamp', reason: 'UNREACHABLE', routineName: 'Lock up' })).toBe("Lock up › Lamp: couldn't reach it")
  })

  it('blames the Run routine step, not the routine containing it, for a problem with a nested call', () => {
    expect(problemText({ deviceName: null, reason: 'ROUTINE_REMOVED', routineName: 'Lock up' })).toBe('Lock up › Run routine: routine removed')
    expect(problemText({ deviceName: null, reason: 'NO_ACCESS', routineName: 'Lock up' })).toBe('Lock up › Run routine: no access')
  })

  it('describes problems with the call itself', () => {
    expect(problemText({ deviceName: null, reason: 'ROUTINE_REMOVED', routineName: null })).toBe('Routine: routine removed')
    expect(problemText({ deviceName: null, reason: 'NESTED_TOO_DEEP', routineName: null })).toBe('too many routines inside each other')
  })
})
