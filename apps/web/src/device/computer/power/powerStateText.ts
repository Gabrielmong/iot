import type { PcPowerAction, PcPowerPhase } from '../../../gql/graphql'

type State = { action: PcPowerAction; phase: PcPowerPhase; secondsLeft?: number | null }

const DOING: Record<PcPowerAction, string> = { SLEEP: 'Going to sleep', SHUTDOWN: 'Shutting down', RESTART: 'Restarting' }
const NOUN: Record<PcPowerAction, string> = { SLEEP: 'Sleep', SHUTDOWN: 'Shut down', RESTART: 'Restart' }
const VERB: Record<PcPowerAction, string> = { SLEEP: 'go to sleep', SHUTDOWN: 'shut down', RESTART: 'restart' }

/** One line on where a power action stands. */
export function powerStateText(s: State): string {
  switch (s.phase) {
    case 'SENT':
      return `Asking the PC to ${VERB[s.action]}…`
    case 'COUNTDOWN':
      return `${DOING[s.action]}${s.secondsLeft === null || s.secondsLeft === undefined ? '' : ` in ${s.secondsLeft} s`}… (someone at the PC can cancel)`
    case 'CANCELLED':
      return `${NOUN[s.action]} cancelled at the PC`
    case 'EXECUTING':
      return `${DOING[s.action]}…`
    case 'SKIPPED':
      return 'Another power action is already running'
  }
}
