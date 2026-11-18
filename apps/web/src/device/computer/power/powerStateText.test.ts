import type { PcPowerAction, PcPowerPhase } from '../../../gql/graphql'
import { powerStateText } from './powerStateText'

const s = (action: PcPowerAction, phase: PcPowerPhase, secondsLeft: number | null = null) => ({
  id: 'p1',
  deviceId: 'pc1',
  action,
  phase,
  secondsLeft,
  requestedBy: 'Ana',
})

describe('powerStateText', () => {
  it.each([
    [s('RESTART', 'COUNTDOWN', 45), 'Restarting in 45 s… (someone at the PC can cancel)'],
    [s('SLEEP', 'COUNTDOWN', 30), 'Going to sleep in 30 s… (someone at the PC can cancel)'],
    [s('SHUTDOWN', 'COUNTDOWN', 10), 'Shutting down in 10 s… (someone at the PC can cancel)'],
    [s('RESTART', 'CANCELLED'), 'Restart cancelled at the PC'],
    [s('SLEEP', 'CANCELLED'), 'Sleep cancelled at the PC'],
    [s('SHUTDOWN', 'CANCELLED'), 'Shut down cancelled at the PC'],
    [s('RESTART', 'EXECUTING'), 'Restarting…'],
    [s('SLEEP', 'EXECUTING'), 'Going to sleep…'],
    [s('SHUTDOWN', 'EXECUTING'), 'Shutting down…'],
    [s('RESTART', 'SKIPPED'), 'Another power action is already running'],
    [s('SLEEP', 'SENT'), 'Asking the PC to go to sleep…'],
    [s('RESTART', 'SENT'), 'Asking the PC to restart…'],
    [s('SHUTDOWN', 'SENT'), 'Asking the PC to shut down…'],
  ])('%o → %s', (state, text) => {
    expect(powerStateText(state)).toBe(text)
  })
})
