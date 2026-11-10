import { routineFixture, runFixture } from '../../test/routineFixtures'
import { clockTime, currentStepLabel, stepProgress, stepStates, timeLeft } from './runProgress'

const NOW = new Date(2026, 10, 9, 20, 36, 0)
const routine = routineFixture({ deviceIds: ['lamp', 'tv'] })
routine.steps.push({ kind: 'WAIT', waitMinutes: 45, actions: [] })
routine.steps.push({ ...routine.steps[0]! })

const at = (h: number, m: number, s = 0) => new Date(2026, 10, 9, h, m, s).toISOString()
const running = (currentStep: number, waitUntil: string | null = null) => runFixture('RUNNING', [], 0, { currentStep, waitUntil })

describe('runProgress', () => {
  it('describes a Set step in progress', () => {
    expect(stepProgress(routine.steps, running(0), NOW)).toEqual({ label: 'Step 1 of 3 · Setting 2 devices…', shortLabel: 'Step 1 of 3 · Setting 2 devices…', fraction: 0 })
  })

  it('counts down a wait and moves the bar through it', () => {
    const p = stepProgress(routine.steps, running(1, at(20, 48)), NOW)!
    expect(p.label).toBe('Step 2 of 3 · Waiting · 12 min left')
    expect(p.shortLabel).toBe('Step 2 of 3 · Waiting')
    expect(p.fraction).toBeCloseTo((1 + 33 / 45) / 3)
  })

  it('names the current step without a countdown', () => {
    expect(currentStepLabel(routine.steps, running(1, at(20, 48)))).toBe('Step 2 of 3 · Waiting')
    expect(currentStepLabel(routine.steps, runFixture('OK'))).toBeNull()
  })

  it('is empty unless the routine is running', () => {
    expect(stepProgress(routine.steps, runFixture('OK'), NOW)).toBeNull()
    expect(stepProgress(routine.steps, null, NOW)).toBeNull()
  })

  it('says how long is left', () => {
    expect(timeLeft(at(20, 36, 30), NOW)).toBe('less than a minute left')
    expect(timeLeft(at(20, 48), NOW)).toBe('12 min left')
    expect(timeLeft(at(22, 1), NOW)).toBe('1 h 25 min left')
    expect(timeLeft(at(20, 0), NOW)).toBe('less than a minute left')
  })

  it('formats a clock time as HH:MM', () => {
    expect(clockTime(at(20, 48))).toBe('20:48')
  })

  it('marks steps done, current, next and later while running', () => {
    expect(stepStates(3, running(1))).toEqual(['done', 'current', 'next'])
    expect(stepStates(4, running(0))).toEqual(['current', 'next', 'later', 'later'])
    expect(stepStates(3, runFixture('OK'))).toEqual(['idle', 'idle', 'idle'])
  })
})
